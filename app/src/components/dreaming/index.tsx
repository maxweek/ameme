import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type FC } from "react";
import { DreamingShader, type DreamingShaderRef } from "./shader";
import s from "./styles.module.scss"
import { MemoryStore } from "../../store/store";
import { Actions } from "../../ui/actions/actions";
import Button from "../../ui/button/button";
import { getCl, getFormattedDate } from "../../helper";
import Table from "../../ui/table/table";
import { JsonViewer } from "../viewers/json";


let timer: any;

interface Props {

}

export const Dreaming: FC<Props> = observer(props => {
  const shaderRef = useRef<DreamingShaderRef>(null);
  const prevPhaseRef = useRef<string>('idle');

  const [messageAccumulator, setMessageAccumulator] = useState<string[]>([])

  const [messageProgress, setMessageProgress] = useState<number>(1)
  const [actionLabel, setActionLabel] = useState<string>('Заснуть')
  const [actionLabelChanging, setActionLabelChanging] = useState<boolean>(false)
  const [curentActionLabel, setCurrentActionLabel] = useState<string>('Заснуть')
  const [phase, setPhase] = useState<string>('idle')

  // ── React to dreaming phases ──────────────────────

  useEffect(() => {
    MemoryStore.loadDreamingHistory();
  }, [])

  useEffect(() => {
    setActionLabelChanging(true)
    console.log(actionLabel)

    const handleChange = () => {
      setCurrentActionLabel(actionLabel)
      setActionLabelChanging(false)
    }
    timer = setTimeout(handleChange, 200)

    return () => {
      handleChange();
      clearTimeout(timer)
    }
  }, [actionLabel])

  useEffect(() => {
    const shader = shaderRef.current;
    if (!shader) return;

    const progress = MemoryStore.dreamingProgress;
    const phase = progress?.phase ?? 'idle';
    const prevPhase = prevPhaseRef.current;
    if (!progress) return;

    setPhase(phase)

    switch (phase) {
      case 'idle':
        shader.setActive(false);
        shader.setExplosion(0);
        shader.reset();
        break;

      case 'collecting':
        shader.setActive(true);
        if (prevPhase === 'idle') shader.explode();
        shader.setIntensity(0.2);
        // shader.setSpeed(0.0011);
        setActionLabel('Засыпаю')
        break;

      case 'analyzing':
        shader.setIntensity(0.22);
        // shader.setSpeed(0.0012);
        setActionLabel('Сплю')
        break;

      case 'writing_facts':
      case 'invalidating':
        shader.setIntensity(0.24);
        // shader.setSpeed(0.0013);
        setActionLabel('Осознаю')
        break;

      case 'merging':
        shader.setIntensity(0.22);
        // shader.setSpeed(0.0012);
        setActionLabel('Вижу сны')
        break;

      case 'diary':
        shader.setIntensity(0.24);
        // shader.setSpeed(0.0011);

        setActionLabel('Мечтаю')
        break;

      case 'rebuilding':
        shader.setIntensity(0.22);
        // shader.setSpeed(0.0011);
        setActionLabel('Фантазирую')
        break;

      case 'complete':
        shader.pulse(1.0);
        shader.setExplosion(0);   // начать затухание explosion
        setActionLabel('Просыпаюсь')
        setTimeout(() => {
          shader.setActive(false);
          setMessageProgress(1)
          shader.reset();
          setActionLabel('Заснуть')
        }, 3000);
        break;

      case 'error':
        shader.setActive(false);
        shader.setExplosion(0);
        shader.reset();
        setActionLabel('Кошмар')
        break;
    }

    if (phase !== 'idle' && phase !== prevPhase) {
      shader.pulse(0.6);
    }

    prevPhaseRef.current = phase;
  }, [MemoryStore.dreamingProgress?.phase]);

  useEffect(() => {
    const shader = shaderRef.current;
    if (!shader) return;

    const progress = MemoryStore.dreamingProgress;

    if (!progress) return;
    console.log(progress)
    setMessageAccumulator(prev => [...prev, progress.message])
    setMessageProgress(progress.progress)

  }, [MemoryStore.dreamingProgress?.message]);


  const handleDream = () => {
    setMessageAccumulator([])
    if (!MemoryStore.dreamingLoading) {
      MemoryStore.triggerDreaming(24)
    }
  }


  return (
    <div className={s.dreamings}>

      <div className={s.dreamings__shader}>
        <DreamingShader ref={shaderRef} />
      </div>

      <div className={s.dreamBox}>
        <div className={s.dreamBox__inner}>
          <div className={`${s.dreamBox__main} ${getCl(!!phase, phase)}`}>
            <div className={s.dreamBox__btn} onClick={handleDream}>
              <div className={`${s.dreamBox__btn_inner} ${getCl(actionLabelChanging, 'changing')}`}>
                {curentActionLabel}
              </div>
              <svg className={s.dreamBox__btn_prog} width={160} height={160} viewBox="0 0 160 160">
                <circle cx={80} cy={80} r={70} stroke="url(#myGradient)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="transparent" strokeDasharray={440} strokeDashoffset={messageProgress / 100 * 440 - 440} />
                <defs>
                  <linearGradient id="myGradient">
                    <stop offset="0%" stop-color="#0055ff" />
                    <stop offset="50%" stop-color="#ff0095" />
                    <stop offset="100%" stop-color="#8000ff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className={s.dreamBox__main_list}>
              {messageAccumulator.map(msg => {
                return <div className={s.dreamBox__main_item}>
                  {msg}
                </div>
              })}
            </div>
          </div>
          <div className={s.dreamBox__list}>

            <Table
              loaded={!MemoryStore.dreamingHistoryLoading}
              thead={[
                { title: 'id' },
                { title: 'status' },
                { title: 'duration' },
                { title: 'error' },
                { title: 'created_at' },
                { title: 'messages' },
                { title: 'merged' },
                { title: 'new_facts' },
                { title: 'stale_facts' },
                { title: 'diary' },
              ]}
              tbody={MemoryStore.dreamingHistory.map(row => {
                return {
                  data: [
                    row.id,
                    row.status,
                    `${(row.duration_ms / 1000).toFixed(2)} s`,
                    row.error ? <JsonViewer>{JSON.parse(row.error)}</JsonViewer> : '-',
                    getFormattedDate(new Date(row.created_at), 'hh:mm dd.MM.yyyy'),
                    row.messages,
                    row.merged,
                    row.new_facts,
                    row.stale_facts,
                    row.diary ? "true" : "false"
                  ]
                }
              })}
            />
          </div>
        </div>
      </div>
    </div>
  )
})