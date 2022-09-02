import { Client } from 'pg'
import { NativeTypes } from './extractTypes'

export type NativeFunc = {
  name: string
  args: string[] | null
  argTypes: string[]
  isVariadic: 1 | 0
  optionalArgCount: number
  returnSet: boolean
  returnType: string
  kind: 'a' | 'f' | 'p' | 'w'
  strict: boolean
  typeParams?: string
}

export async function extractNativeFuncs(client: Client, types: NativeTypes) {
  const { rows: nativeFuncs } = await client.query<NativeFunc>(
    `select proname "name", proargnames "args", proargtypes "argTypes", provariadic "isVariadic", pronargdefaults "optionalArgCount", prorettype "returnType", proretset "returnSet", prokind "kind", proisstrict "strict" from pg_proc where proname not like '\\_%' escape '\\' and prorettype = ANY ($1)`,
    [types.map(t => [t.id, t.arrayId])]
  )

  // TODO: need special implementations for these functions
  const ignoredFuncs = [
    'first_value',
    'lag',
    'last_value',
    'lead',
    'mode',
    'nth_value',
    'percentile_disc',
  ]

  const elementTypes = ['anyelement', 'anycompatible']

  return nativeFuncs.filter(fn => {
    if (ignoredFuncs.includes(fn.name)) {
      return
    }

    const argTypes = fn.argTypes
      ? ((fn as any).argTypes as string)
          .trim()
          .split(' ')
          .map(t => types.byId[+t])
      : []

    // Just need to check argTypes, since returnType is checked
    // in the SQL query above.
    if (argTypes.some(t => t == null)) {
      return
    }

    fn.argTypes = argTypes.map(t => t.jsType)
    fn.returnType = types.byId[+fn.returnType].jsType

    const hasGenericReturn = types.any.includes(fn.returnType)
    const genericArrayArg = argTypes.find(
      t => types.any.includes(t.name) && !elementTypes.includes(t.name)
    )

    const newArgTypes = [...fn.argTypes]
    const genericArgTypes = argTypes.filter((argType, i) => {
      if (types.any.includes(argType.name)) {
        newArgTypes[i] = elementTypes.includes(argType.name)
          ? genericArrayArg
            ? 't.elementof<T>'
            : 'T | UnwrapType<T>'
          : 'T'

        return true
      }
    })

    const needsTypeParam =
      genericArgTypes.length > 1 ||
      (genericArgTypes.length == 1 && hasGenericReturn)

    if (needsTypeParam) {
      fn.argTypes = newArgTypes
      if (genericArrayArg) {
        fn.typeParams = `<T extends ${genericArrayArg.jsType}>`
        if (hasGenericReturn) {
          fn.returnType = elementTypes.includes(fn.returnType)
            ? 't.elementof<T>'
            : 'T'
        }
      } else {
        fn.typeParams = '<T extends Type = t.any>'
        if (hasGenericReturn) {
          fn.returnType = elementTypes.includes(fn.returnType)
            ? 'T'
            : 't.array<T>'
        }
      }
    }

    return true
  })
}
