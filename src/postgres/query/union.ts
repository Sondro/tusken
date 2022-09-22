import { TokenArray } from '../internal/token'
import { tokenizeSetProps } from '../internal/tokenize'
import { UnionProps } from '../props/union'
import type { Query } from '../query'
import type { Selectable, SelectionSource } from '../selection'
import { SetBase } from './base/set'
import type { Select } from './select'

export class Union<From extends Selectable[] = any> //
  extends SetBase<From, UnionProps>
{
  protected get sources(): SelectionSource[] {
    return this.props.selects[0]['sources']
  }
  protected tokenize(props: UnionProps, ctx: Query.Context): TokenArray {
    return [
      { join: props.selects.map(query => ({ query })), with: ' UNION ' },
      tokenizeSetProps(props, ctx),
    ]
  }

  union(query: Select<From>) {
    this.props.selects.push(query)
    return this
  }
}