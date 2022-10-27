import { Client, ConnectFn, ConnectOptions } from './connection'
import { Query, QueryPromise } from './query'
import { Count } from './query/count'
import { Delete } from './query/delete'
import { Put } from './query/put'
import { Select } from './query/select'
import { FindWhere, wherePrimaryKeyEquals } from './query/where'
import { RowInsertion, RowKeyedUpdate, RowUpdate } from './row'
import {
  Selectable,
  SelectedRow,
  Selection,
  SelectionSources,
} from './selection'
import { QueryStream } from './stream'
import { kDatabaseQueryStream, kDatabaseReserved } from './symbols'
import { RowIdentity, TableRef, toTableRef } from './table'

export interface DatabaseConfig {
  client: Client
  connect: ConnectFn
  reserved: string[]
  QueryStream?: typeof QueryStream
}

export class Database {
  protected [kDatabaseReserved]: string[]
  protected [kDatabaseQueryStream]?: typeof QueryStream
  readonly connect: (opts?: ConnectOptions) => Database
  client: Client

  constructor(config: DatabaseConfig) {
    this[kDatabaseReserved] = config.reserved
    this[kDatabaseQueryStream] = config.QueryStream
    this.client = config.client
    this.connect = opts =>
      new Database({
        ...config,
        client: config.connect(opts),
      })
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
    pk: RowIdentity<From>
  ): QueryPromise<number>
  delete(from: TableRef, pk?: any) {
    const query = this.query({
      type: 'delete',
      props: { from },
      query: new Delete(this),
    })
    if (arguments.length > 1) {
      return query.where(wherePrimaryKeyEquals(pk, from))
    }
    return query
  }

  /**
   * Same as `select` but only one row (or null) is returned.
   */
  find<T extends Selectable>(
    from: T,
    filter: FindWhere<SelectionSources<T>>
  ): QueryPromise<SelectedRow<T> | null> {
    return this.select(from).where(filter).at(0) as any
  }

  /**
   * Get a row by its primary key.
   *
   * To get a row by any other column, use the `db.find` method instead.
   */
  get<T extends TableRef | Selection<any, TableRef>>(
    from: T,
    pk: RowIdentity<T>
  ): QueryPromise<SelectedRow<T> | null> {
    return this.find<T>(from, wherePrimaryKeyEquals(pk, toTableRef(from)))
  }

  /**
   * Insert 1+ rows into a table.
   */
  put<T extends TableRef>(
    table: T,
    row: RowInsertion<T> | readonly RowInsertion<T>[]
  ): Put<T>

  /**
   * Update 1+ rows in a table.
   */
  put<T extends TableRef>(
    table: T,
    row: RowKeyedUpdate<T> | readonly RowKeyedUpdate<T>[]
  ): Put<T>

  /**
   * Update or delete a row by its primary key.
   */
  put<T extends TableRef>(
    table: T,
    pk: RowIdentity<T>,
    row: RowUpdate<T> | null
  ): Put<T>

  put(table: TableRef, pk: any, data?: any) {
    if (arguments.length == 2) {
      data = pk
      pk = undefined
    } else if (data === null) {
      return this.delete(table, pk)
    }
    return this.query({
      type: 'put',
      query: new Put(this),
      props: { table, data, pk },
    })
  }

  select<T extends Selectable>(from: T) {
    return this.query({
      type: 'select',
      query: new Select<[T]>(this),
      props: { from },
    })
  }

  protected query<T extends Query>(node: {
    type: string
    query: T
    props: T extends Query<infer Props> ? Props : never
  }): T

  protected query(node: any) {
    node.query.nodes.push(node)
    return node.query
  }
}
