import { observer } from "mobx-react-lite";
import { useEffect, useState, type FC } from "react";
import { MemoryStore } from "../../store/store";
import s from "./styles.module.scss"
import { NavLink } from "react-router-dom";
import { Actions } from "../../ui/actions/actions";
import Button from "../../ui/button/button";
import { getCl } from "../../helper";
import Icon from "../../ui/icon/icon";

interface Props {

}

export const Header: FC<Props> = observer(props => {


  return (
    <header className={s.header}>
      <div className={s.header__inner}>
        <div className={s.header__col}>
          <div className={s.header__row}>
            <NavLink to={'/'} className={s.header__logo}>[memEn]</NavLink>
            <Actions className={s.header__navList}>
              <NavLink to='/' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="activity" />
                graph
              </NavLink>
              <NavLink to='/verbatim' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="database" />
                verbatim
              </NavLink>
              <NavLink to='/obsidian' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="list" />
                obsidian
              </NavLink>
              <NavLink to='/startup' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="sun" />
                startup
              </NavLink>
              <NavLink to='/dreaming' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="moon" />
                dreaming
              </NavLink>
              <NavLink to='/operations' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="layers" />
                operations
              </NavLink>
              <NavLink to='/info' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
                <Icon name="info" />
                info
              </NavLink>
            </Actions>
          </div>
        </div>
        <div className={s.header__col}>
          <Actions>
            <NavLink to='/search' className={({ isActive }) => `${s.header__navBtn} ${getCl(!!isActive, "active")}`}>
              <Icon name="search" />
              search
            </NavLink>
          </Actions>
        </div>
      </div>
    </header >
  )
})
