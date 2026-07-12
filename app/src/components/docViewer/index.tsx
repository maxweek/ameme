import { useEffect, useMemo, useRef, useState, type FC } from "react";
import s from "./styles.module.scss";

import { observer } from "mobx-react-lite";
import { MemoryStore } from "../../store/store";
import { getCl } from "../../helper";
import { ScrollBox } from "../../ui/scroller/scroller";
import Icon from "../../ui/icon/icon";
import MDEditor from "@uiw/react-md-editor";
import { ObsidianViewer } from "../viewers/obsidian";
import { ObsidianDocGraph } from "./graph";
import { Selector } from "../../ui/selector/selector";


export interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  count: number
}


interface Props {
  graphVisible: boolean
}

export const DocViewer: FC<Props> = observer(props => {
  const [activeDoc, setActiveDoc] = useState<string>('')

  const [opened, setOpened] = useState<string[]>([])

  useEffect(() => {
    MemoryStore.loadObsidianList('')
  }, [])

  useEffect(() => {
    if (!activeDoc) return
    MemoryStore.loadObsidianDoc(activeDoc)
  }, [activeDoc])

  useEffect(() => {
    if (!activeDoc) return;
    // Развернуть все родительские папки
    const parts = activeDoc.split('/');
    if (parts.length > 1) {
      const folders: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        folders.push(parts.slice(0, i).join('/'));
      }
      setOpened(prev => {
        const next = new Set([...prev, ...folders]);
        return Array.from(next);
      });
    }
  }, [activeDoc]);


  const tree = useMemo(() => {
    const root: TreeNode[] = [];

    for (const doc of MemoryStore.obsidianDocs) {
      const parts = doc.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const path = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;

        let existing = current.find(n => n.name === name);

        if (!existing) {
          existing = {
            name,
            path,
            isFolder: !isLast,
            children: [],
            count: 0
          };
          current.push(existing);
        }

        // Промежуточный сегмент — папка даже если раньше не был
        if (!isLast && !existing.isFolder) {
          existing.isFolder = true;
        }

        existing.count += 1;

        current = existing.children;
      }
    }

    // Сортировка: папки первые, потом по имени
    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, 'ru');
      });
      nodes.forEach(n => sortTree(n.children));
    };

    // sortTree(root);
    return root;
  }, [MemoryStore.obsidianDocs]);


  const renderList = (root: TreeNode[]) => {
    return root.map(el => {
      const activate = () => {
        if (el.isFolder) {
          if (opened.includes(el.path)) {
            console.log(el.path)
            setOpened(prev => prev.filter(p => p !== el.path))
          } else {
            setOpened(prev => [...prev, el.path])
          }
        } else {
          setActiveDoc(el.path)
        }
      }
      return <div
        key={el.path}
        className={`${s.docViewer__item} ${getCl(activeDoc === el.path, 'active')} ${getCl(opened.includes(el.path), 'opened')} ${getCl(el.isFolder, 'folder')}`}

      >
        <div className={`${s.docViewer__item_head}`} onClick={activate}>
          {el.isFolder && <div className={s.docViewer__item_indi}>
            <Icon name="chevron-right" />
          </div>}
          {el.name}
          {el.isFolder && <div className={s.docViewer__item_count}>{el.count}</div>}
        </div>
        {(el.isFolder && opened.includes(el.path)) && <div className={s.docViewer__item_list}>
          {renderList(el.children)}
        </div>}
      </div>
    })
  }


  return (
    <div className={`${s.docViewer} ${getCl(MemoryStore.obsidianLoading, 'loading')}`}>
      {!props.graphVisible && <div className={s.docViewer__side}>
        <ScrollBox className={s.docViewer__scroller}>

          <div className={s.docViewer__list}>
            {renderList(tree)}
          </div>
        </ScrollBox>
      </div>}
      <div className={`${s.docViewer__body}`}>
        {props.graphVisible ?
          <div className={`${s.docViewer__graph} ${getCl(MemoryStore.obsidianDocGraphLoading, 'loading')}`}>
            <ObsidianDocGraph
              onNavigate={setActiveDoc}
            />
          </div>
          :
          <div className={`${s.docViewer__doc} ${getCl(MemoryStore.obsidianDocLoading, 'loading')}`}>
            <div className={s.docViewer__bradcrumbs}>
              {MemoryStore.obsidianContentPath?.split('/').map(el => <div className={s.docViewer__bradcrumbs_item}>{el}</div>)}
            </div>
            <ObsidianViewer
              content={MemoryStore.obsidianContent ??  "## Нет контента"}
              onNavigate={setActiveDoc}
            />
          </div>
        }
      </div>
    </div>
  )
})
