import { TrackballControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import s from "./styles.module.scss";
import { Graph, type Link, type Node } from "../graph";
import { observer } from "mobx-react-lite";
import { MemoryStore } from "../../store/store";
import type { DisplayMode } from "../graph/constants";
import { BrainModel } from "./model";
import { Scene_Controls } from "../cameraControls";
import { Selector } from "../../ui/selector/selector";
import Button from "../../ui/button/button";
import { getCl, getFormattedDate } from "../../helper";
import Icon from "../../ui/icon/icon";
import { ObsidianViewer } from "../viewers/obsidian";
import { ScrollBox } from "../../ui/scroller/scroller";
import Table from "../../ui/table/table";
import { getNodeColor } from "../graph/utils";

interface Props {

}

export const Brain: FC<Props> = observer(props => {
  const [type, setType] = useState<DisplayMode>('clusters');
  const [links, setLinks] = useState<Link[]>([])
  const [node, setNode] = useState<Node | null>(null)

  const selectNode = useCallback((node: Node) => {
    console.log(node)
    setNode(node)
    setLinks(node.links ?? [])
  }, [])

  const selectLink = useCallback((node: Link) => {
    console.log(node)
    setLinks([node])
    setNode(null)
  }, [])

  const resetCamera = () => {
    window.dispatchEvent(new CustomEvent('_cameraReset'))
  }


  useEffect(() => {
    MemoryStore.loadGraph();
  }, [])

  const clearNodeLink = () => {
    setNode(null)
    setLinks([])
  }

  console.log(links)

  return (
    <div className={s.brain}>
      <div className={s.brain__graph}>
        <Canvas flat camera={{ position: [0, 0, 1000], far: 8000 }}>

          <Scene_Controls />
          <Graph
            displayMode={type}
            onNodeClick={selectNode}
            onLinkClick={selectLink}
          />
          <BrainModel />
        </Canvas>
      </div>
      <div className={s.brain__ui}>
        <div className={`${s.brain__side} ${getCl(!!links?.[0] || !!node, 'active')}`}>
          <div className={s.brain__side_head}>
            <div className={s.brain__side_title}>
              {node && 'Нода'}
              {(links?.[0] && !node) && 'Связь'}
            </div>
            <div className={s.brain__side_close} onClick={clearNodeLink}>
              <Icon name="x" />
            </div>
          </div>
          <div className={s.brain__side_inner}>
            <ScrollBox className={s.brain__side_scroller}>
              <div className={s.brain__side_body}>
                {node && <div className={s.brain__node}>
                  <div className={'t2 __color_gray'}>{node.id}</div>

                  <h2>{node.name} <div className={s.brain__info_type} style={{ background: getNodeColor(node.type, false) }}>{node.type}</div></h2>
                  <div className={s.brain__info_text}>{node.summary}</div>
                  <Table thead={[
                    { width: '50%' },
                    { width: '50%' },
                  ]}
                    disableHead={true}
                    tbody={[
                      { data: ["Векторов", node.embeddingsCount] },
                      { data: ["Создано", getFormattedDate(new Date(node.createdAt), 'hh:mm dd.MM.yyyy')] },
                    ]}
                  />
                </div>}
                {links.map(link => {
                  return (
                    <div className={s.brain__link}>
                      <div className={'t2 __color_gray'}>{link.uuid}</div>
                      {typeof link.source === "object" ? <>

                        <h3>
                          <a href="#" onClick={() => selectNode(link.source as Node)}>
                            {link.source.name}
                          </a>
                          <div className={s.brain__info_type} style={{ background: getNodeColor(link.source.type, false) }}>{link.source.type}</div>
                        </h3>
                        <div className={s.brain__info_text}>{link.source.summary}</div>
                      </> : '-'}
                      <div className={s.brain__linkBox}>
                        <h2>{link.name}</h2>
                        <div className={s.brain__info_text}>{link.fact}</div>
                      </div>
                      {typeof link.target === "object" ? <>

                        <h3>
                          <a href="#" onClick={() => selectNode(link.target as Node)}>
                            {link.target.name}
                          </a>
                          <div className={s.brain__info_type} style={{ background: getNodeColor(link.target.type, false) }}>{link.target.type}</div>
                        </h3>
                        <div className={s.brain__info_text} >{link.target.summary}</div>
                      </> : '-'}
                      <Table thead={[
                        { width: '50%' },
                        { width: '50%' },
                      ]}
                        disableHead={true}
                        tbody={[
                          { data: ["Векторов", link.embeddingsCount] },
                          { data: ["Создано", getFormattedDate(new Date(link.createdAt), 'hh:mm dd.MM.yyyy')] },
                          { data: ["Валидно с", getFormattedDate(new Date(link.validAt), 'hh:mm dd.MM.yyyy')] },
                          { data: ["Невалидно с", link.invalidAt ? getFormattedDate(new Date(link.invalidAt), 'hh:mm dd.MM.yyyy') : '-'] },
                        ]}
                      />
                    </div>
                  )
                })}
              </div>
            </ScrollBox>
          </div>
        </div>
        <div className={s.brain__bottom}>
          <Selector
            value={type}
            options={[
              { title: 'clusters', value: 'clusters' },
              { title: 'groups', value: 'groups' },
              { title: 'simple', value: 'simple' }
            ]}
            onChange={el => setType(el.value)}
          />
          <Button type="secondary" icon="camera" onClick={resetCamera} />
        </div>
      </div>
    </div>
  )
})
