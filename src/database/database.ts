import { isObject } from '../utils/isObject'
import { Query, ValidQuery } from './query'
import { Count } from './query/count'
import { Delete } from './query/delete'
import { Put } from './query/put'
import { Select, Selectable, SelectedRow } from './query/select'
import { Where } from './query/where'
import { QueryStream } from './stream'
import { kDatabaseQueryStream, kDatabaseReserved, kPrimaryKey } from './symbols'
import { PrimaryKey, RowInsertion, RowUpdate, TableRef } from './table'

export type ClientResult = { rows: any[]; rowCount?: number }
export type Client = {
  query: {
    (query: string, values: any[]): Promise<ClientResult>
    <T>(stream: QueryStream<T>): QueryStream<T>
  }
  end: () => Promise<void>
}

export interface DatabaseConfig {
  client: Client
  reserved: string[]
  QueryStream?: typeof QueryStream
}

export class Database {
  protected [kDatabaseReserved]: string[]
  protected [kDatabaseQueryStream]?: typeof QueryStream
  client: Client

  constructor(config: DatabaseConfig) {
    this[kDatabaseReserved] = config.reserved
    this[kDatabaseQueryStream] = config.QueryStream
    this.client = config.client
  }

  /**
   * Count the number of rows in a selection. You can use the
   * `where` and `innerJoin` methods to be more specific.
   *
   * You need to use `pg.count` instead if you want to check
   * a specific column for `NULL` before counting a row.
   */
  count<From extends TableRef>(from: From) {
    return this.query({
      type: 'count',
      query: new Count(this),
      props: { from },
    })
  }

  delete<From extends TableRef>(from: From): Delete<From>
  delete<From extends TableRef>(
    from: From,
    pk: PrimaryKey<From>
  ): ValidQuery<number>
  delete(from: TableRef, pk?: any) {
    const query = this.query({
      type: 'delete',
      props: { from },
      query: new Delete(this),
    })
    if (arguments.length > 1) {
      query.where(from => {
        return from[kPrimaryKey].eq(pk)
      })
    }
    return query
  }

  /**
   * Same as `select` but only one row (or null) is returned.
   */
  find<T extends Selectable>(
    from: T,
    filter: Where<[T]>
  ): ValidQuery<SelectedRow<T> | null> {
    return this.select(from).where(filter).at(0) as any
  }

  /**
   * Get a row by its primary key.
   *
   * To get a row by any other column, use the `db.find` method instead.
   */
  get<T extends Selectable>(
    from: T,
    pk: PrimaryKey<T>
  ): ValidQuery<SelectedRow<T> | null> {
    return this.find(from as Extract<T, TableRef>, from =>
      from[kPrimaryKey].eq(pk)
    )
  }

  /** https://www.postgresql.org/docs/current/sql-insert.html */
  insert<T extends TableRef>(table: T): never {
    throw Error('not implemented')
  }

  /** https://www.postgresql.org/docs/current/sql-merge.html */
  mergeInto<T extends TableRef>(table: T): never {
    throw Error('not implemented')
  }

  /**
   * Insert a row into the table.
   */
  put<T extends TableRef>(table: T, row: RowInsertion<T>): Put<T>

  /**
   * Insert, update, or delete a row by its primary key.
   */
  put<T extends TableRef>(
    table: T,
    pk: PrimaryKey<T>,
    row: RowUpdate<T> | null
  ): Put<T>

  put(table: TableRef, pk: any, row?: any) {
    if (isObject(pk)) {
      row = pk
      pk = undefined
    } else if (row === null) {
      return this.delete(table, pk)
    }
    return this.query({
      type: 'put',
      query: new Put(this),
      props: { table, row, pk },
    })
  }

  select<T extends Selectable>(from: T) {
    return this.query({
      type: 'select',
      query: new Select<[T]>(this),
      props: { from },
    })
  }

  /** https://www.postgresql.org/docs/current/sql-update.html */
  update<T extends TableRef>(table: T): never {
    throw Error('not implemented')
  }

  protected query<T extends Query>(node: {
    type: T extends Query<any, infer Command> ? Command : never
    props: T extends Query<infer Props> ? Props : never
    query: T
  }): T

  protected query(node: any) {
    node.query.context.nodes.push(node)
    return node.query
  }
}
