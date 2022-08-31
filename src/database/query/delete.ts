import { kTableName } from '../symbols'
import { TableRef } from '../table'
import { CheckList } from './check'
import { renderExpression } from './expression'
import { Query } from './node'
import { TokenArray } from './token'
import { where, Where } from './where'

type Props = {
  from: TableRef
  where?: CheckList
}

export class Delete<From extends TableRef, Return = number>
  extends Query<Props, 'delete'>
  implements PromiseLike<Return>
{
  protected tokens(props: Props, ctx: Query.Context) {
    const tokens: TokenArray = ['DELETE FROM', { id: props.from[kTableName] }]

    if (props.where) {
      tokens.push('WHERE', renderExpression(props.where, ctx))
    }
    return tokens
  }

  where(compose: Where<[From]>) {
    where(this.props, compose)
    return this
  }

  using(): never {
    throw Error('not implemented')
  }

  returning(): never {
    throw Error('not implemented')
  }
}
