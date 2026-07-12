import React, { type FC, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import './styles.scss';
import { getCl, getClR, getRawHtml } from "../../helper";
import EmptyBox from "../emptyBox/emptyBox";
import Icon from "../icon/icon";
import { ScrollBox } from "../scroller/scroller";
import { Tooltip } from "../tooltip/tooltip";
import _ from "lodash";

export interface ITable {
  thead: {
    title?: any,
    titleRaw?: boolean
    width?: string,
    align?: 'center' | 'right',
    className?: string,
    element?: ReactNode,
    sort?: "ASC" | "DESC"
    drop?: ReactNode
    onClick?: () => void
  }[],
  disableHead?: boolean,
  tbody?: ({
    action?: (blank?: boolean) => void,
    data: any[],
    field?: ({
      name: string,
    } | undefined)[]
  } | undefined)[],
  tside?: (number | string | ReactNode)[]
  tsideHeader?: number | string | ReactNode
  className?: string,
  disableFilledHeader?: boolean,
  headCellWidth?: number[],
  setHeadCellWidth?: (v: number[]) => void,
  empty?: boolean,
  sort?: number[]
  loaded?: boolean;
  stickyHeader?: boolean
  grab?: boolean
  parentScroller?: HTMLDivElement | null
}

let scrolled = false;

export const Table: FC<ITable> = (props: ITable) => {
  const ref = useRef<HTMLTableElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const [filledHeader, setFilledHeader] = useState(true)
  const [headCellWidth, setHeadCellWidth] = useState<number[]>([]);
  const [sideCellHeight, setSideCellHeight] = useState<number[]>([]);
  const rowRef = useRef<HTMLTableRowElement>(null)


  useEffect(() => {
    setFilledHeader(true)
    window.addEventListener('resize', setHeadDeb)
    return () => {
      window.removeEventListener('resize', setHeadDeb)
    }
  }, [])

  useEffect(() => {
    if (!ref.current) return;
    if (!tableRef.current) return;
    if (!props.stickyHeader) {
      ref.current.style.transform = 'none'
      return
    };
    if (props.parentScroller) {
      props.parentScroller?.addEventListener('scroll', checkScroll)
    } else {
      window.addEventListener('scroll', checkScroll)
    }
    return () => {
      window.removeEventListener('scroll', checkScroll)
      if (props.parentScroller) {
        props.parentScroller.removeEventListener('scroll', checkScroll)
      } else {
        window.removeEventListener('scroll', checkScroll)
      }
    }
  }, [ref, tableRef, props.stickyHeader, props.parentScroller])

  const checkScroll = () => {
    if (!tableRef.current) return
    if (!ref.current) return

    const bRect = tableRef.current.getBoundingClientRect();
    let scrollerBRect = null
    if (props.parentScroller) scrollerBRect = props.parentScroller.getBoundingClientRect();

    // console.log(scrollerBRect?.bottom, bRect.bottom)
    if (scrollerBRect) {
      // console.log(scrollerBRect.top - bRect.top)
      if (scrollerBRect.top - bRect.top > 0) {
        ref.current.style.transform = `translateY(${scrollerBRect.top - bRect.top + 16}px)`
      } else {
        ref.current.style.transform = 'none'
      }
    } else {
      if (bRect.bottom > 172) {
        if (bRect.top < 72) {
          ref.current.style.transform = `translateY(${-bRect.top + 72}px)`
        } else {
          ref.current.style.transform = 'none'
        }
      }
    }
  }

  useEffect(() => {
    setHead()
  }, [rowRef, props.thead, props.tbody])

  useEffect(() => {
    if (props.headCellWidth) {
      setHeadCellWidth(props.headCellWidth)
    }
  }, [props.headCellWidth])

  const setHead = () => {
    if (!rowRef.current) return;
    if (!tableRef.current) return;
    let arr: number[] = [];
    let ths = rowRef.current.querySelectorAll('th')
    ths?.forEach(th => {
      arr.push(th.offsetWidth)
    })

    setHeadCellWidth(arr)
    if (typeof props.setHeadCellWidth === 'function') {
      props.setHeadCellWidth(arr)
    }

    if (props.tside) {
      let arr: number[] = [];
      let trs: NodeListOf<HTMLTableRowElement> = tableRef.current.querySelectorAll('.table__body tr:not(:last-child)')
      trs?.forEach(th => {
        arr.push(th.offsetHeight)
      })
      setSideCellHeight(arr)
    }
  }
  const setHeadDeb = _.debounce(() => {
    setHead()
  }, 400)

  const memoizedThead = useMemo(() => props.thead, [props.thead]);
  const memoizedTbody = useMemo(() => props.tbody, [props.tbody]);
  const memoizedTside = useMemo(() => props.tside, [props.tside]);

  const classlist = [
    "table",
    getClR(props.className),
    getCl(filledHeader, 'filledHeader'),
    getCl(!!props.tside, 'withSide'),
    getCl(props.loaded !== undefined, 'withLoad'),
    getCl(props.loaded, 'loaded'),
    getCl(props.grab, 'grab'),
  ].join(" ")

  return (
    <div className={classlist} ref={tableRef}>
      {memoizedTside &&
        <div className="table__side">
          <div className="table__side_header table__header">
            <table>
              <thead>
                <tr>
                  <th>
                    <div className={`col_h`}>
                      <div className="col_h_inner">
                        {props.tsideHeader}
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="table__side_list">
            <table>
              <tbody>
                {memoizedTside?.map((ts, i) => {
                  return (
                    <tr key={'tableSideCellR__' + i}>
                      <td style={{ height: sideCellHeight[i] }}>
                        <div className="col table__side_item">
                          {ts}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="td__hidden"><th></th></tr>
              </tbody>
            </table>
          </div>
        </div>
      }
      <div className="table__inner">
        <div className="table__box">
          {(memoizedThead && !props.disableHead) &&
            <div className="table__header" ref={ref}>
              <table>
                <thead>
                  <tr>
                    {memoizedThead.map((head, i) => {
                      if (head.element) {
                        return <th
                          key={'tableHeadHead__' + i}
                          className={`${getCl(!!head.align, head.align)} ${getClR(head.className)} ${getCl(head.title === 'cbx', 'cbx')}`}
                          style={{ width: headCellWidth[i] }}
                        >
                          <div className="col_h">

                            {head.element}
                          </div>
                        </th>
                      }
                      return (<th className={`${getCl(!!head.align, head.align)} ${getClR(head.className)}`}
                        style={{ width: headCellWidth[i] }}
                        key={'tableHead__' + i}
                      >
                        {/* <div className={`col_h ${getCl(!!head.onClick, 'clickable')}`} onClick={head.onClick}>
                            <div className="col_h_inner">
                              {head.sort === "ASC" && <Icon name="chevron-up" />}
                              {head.sort === "DESC" && <Icon name="chevron-down" />}
                              <span dangerouslySetInnerHTML={getRawHtml(head.title)} />
                            </div>
                            {head.drop &&
                              <div className="col_h_drop">{head.drop}</div>
                            }

                          </div> */}
                        <TableHeadItem
                          sort={head.sort}
                          title={head.title}
                          drop={head.drop}
                          onClick={head.onClick}
                          titleRaw={head.titleRaw}
                        />
                      </th>)
                    })}
                  </tr>
                </thead>
              </table>
            </div>
          }
          {(memoizedTbody && props.tbody?.length) ?
            <table className="table__body">
              <tbody>
                {memoizedTbody.map((row, irow) => {
                  let i = 0
                  if (!row) return null
                  return (
                    <React.Fragment key={'tableRowFrag__' + irow}>
                      <tr key={'tableRow__' + irow}
                        className={`${getCl(!!row?.action, 'clickable')}`}
                        onPointerDown={() => scrolled = false}
                        onClick={() => !scrolled && row?.action?.()}
                        onPointerUp={e => {
                          if (e.button === 1 && !scrolled) {
                            row?.action?.(true)
                          }
                        }}>
                        {/* {'tableRow__' + irow} */}
                        {row?.data.map((cell, icell) => {
                          let head: any = props.thead?.[i];
                          i++;
                          if (head === undefined) {
                            return null
                          }
                          return (
                            <td
                              className={`${getCl(!!head.align, head.align)} ${getClR(head.className)}  ${getCl(head.title === 'cbx', 'cbx')}`}
                              style={{ width: head.width }}
                              key={'tableCell__' + irow + '_' + icell}
                            >
                              <div className="col">
                                {cell}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                      {/* {(row.field && row.field.length && row.field[0] !== undefined) &&
                          <tr key={'tableRow__under_' + irow} className={`__fields`} onClick={() => row.action?.()}>
                            <td></td>
                            <td colSpan={row.data.length}>
                              <div className="_fields_col">
                                {row.field.map((r, i) => {
                                  // console.log(r, row)
                                  if (!r) return
                                  return (
                                    <div key={`field__${irow}_${r.name}_${i}`} className="_fields_row">
                                      <div className="_fields_row_title">{r.name}:</div>
                                      <Actions wrap={true} className="_fields_row_list">
                                        {r.field.length ? r.field.map((el, _i) => {
                                          if (el) {
                                            return <TypeSmall key={`field__${irow}_${r.name}_${_i}_${i}`} type={el.type} name={el.name} big={true} bordered={true} />
                                          } else {
                                            return 'не определено'
                                          }
                                        }) : 'не определено'}
                                      </Actions>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        } */}
                    </React.Fragment>
                  )
                })}
                {memoizedThead &&
                  <tr ref={rowRef} className="td__hidden">

                    {memoizedThead.map((head, i) => {
                      if (head.element) {
                        return <th
                          key={'tableCell__last_' + i}
                          className={`${getCl(!!head.align, head.align)} ${getClR(head.className)}  ${getCl(head.title === 'cbx', 'cbx')}`}
                          style={{ width: headCellWidth[i] }}
                        >
                          {head.element}
                        </th>
                      }
                      return (<th
                        className={`${getCl(!!head.align, head.align)} ${getClR(head.className)}  ${getCl(head.title === 'cbx', 'cbx')}`}
                        style={{ width: headCellWidth[i] }}
                        key={'tableCell__last_' + i}
                      >
                        <div className={`col_h ${getCl(!!head.onClick, 'clickable')}`} onClick={head.onClick}>
                          <div className="col_h_inner">
                            {head.sort === "ASC" && <Icon name="chevron-up" />}
                            {head.sort === "DESC" && <Icon name="chevron-down" />}
                            <span dangerouslySetInnerHTML={getRawHtml(head.title)} />
                          </div>
                        </div>
                      </th>)
                    })}
                  </tr>
                }
              </tbody>
            </table>

            : props.empty ? <EmptyBox /> : null}
        </div>
      </div>
    </div>
  )
}

export const Table_LoadMask: FC<{ count?: number }> = (props) => {
  const count = props.count ?? 10;
  return (
    <div className="table__loadMask">
      <div className="table__head"></div>
      <div className="table__body">
        {Array.from({ length: count }).map((el, i) =>
          <div className="table__row" key={'tableMask__' + i} data-el={el}>
            <div className="table__cell" />
          </div>
        )}
      </div>
    </div>
  )
}

interface ITableHeadItem {
  onClick?: () => void
  sort?: 'ASC' | 'DESC'
  drop?: ReactNode
  title: any
  titleRaw?: boolean
}

const TableHeadItem: FC<ITableHeadItem> = props => {
  const ref = useRef<HTMLDivElement>(null)

  return <div
    className={`col_h ${getCl(!!props.onClick, 'clickable')}`}
    onClick={props.onClick}
    ref={ref}
  >
    <div className="col_h_inner">
      {props.sort === "ASC" && <Icon name="chevron-up" />}
      {props.sort === "DESC" && <Icon name="chevron-down" />}
      {props.titleRaw ? props.title
        :
        <span dangerouslySetInnerHTML={getRawHtml(props.title)} />
      }
    </div>
    {/* {props.drop &&
      <div className="col_h_drop">{props.drop}</div>
    } */}
    {props.drop &&
      <Tooltip headRef={ref}>
        {props.drop}
      </Tooltip>
    }
  </div>
}

export default Table;