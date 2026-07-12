import { useEffect, type FC, type ReactNode } from "react";
import { Brain } from "../components/brain";
import { Page } from "../ui/page/page";
import { MemoryStore } from "../store/store";
import Table from "../ui/table/table";
import { getFormattedDate } from "../helper";
import { JsonViewer } from "../components/viewers/json";
import { observer } from "mobx-react-lite";




interface Props {

}

export const OperationsPage: FC<Props> = observer(props => {

  useEffect(() => {
    MemoryStore.loadOpLog();
  }, [])


  return (
    <Page title="Operations">
      <Table
        loaded={!MemoryStore.opLogLoading}
        thead={[
          { title: 'id', width: '10%' },
          { title: 'type', width: '6%' },
          { title: 'timestamp', width: "10%" },
          { title: 'duration', width: '6%' },
          { title: 'input', width: '30%' },
          { title: 'output' },
        ]}
        tbody={MemoryStore.opLog.map(row => {
          return {
            data: [
              `#...${row.id.slice(row.id.length - 8, row.id.length)}`,
              row.operation,
              getFormattedDate(new Date(row.timestamp), 'hh:mm dd.MM.yyyy'),
              `${(row.durationMs / 1000).toFixed(2)} s`,
              <JsonViewer>{row.input}</JsonViewer>,
              <JsonViewer collapsed={1}>{row.result}</JsonViewer>,
              // row.input
            ]
          }
        })}
      />
    </Page>
  )
})