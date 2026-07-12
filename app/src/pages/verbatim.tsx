import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { Brain } from "../components/brain";
import { Page } from "../ui/page/page";
import Table from "../ui/table/table";
import { MemoryStore } from "../store/store";
import { observer } from "mobx-react-lite";
import { Actions } from "../ui/actions/actions";
import { Dropdown } from "../ui/dropdown/dropdown";
import Input, { type IPropertyItem } from "../ui/input/input";
import { getFormattedDate } from "../helper";
import { JsonViewer } from "../components/viewers/json";


interface Props {

}

export const VerbatimPage: FC<Props> = observer(props => {

  const [role, setRole] = useState<string>('')
  const [channel, setChannel] = useState<string>('')
  const [session, setSession] = useState<string>('')

  useEffect(() => {
    MemoryStore.loadMessages()
  }, [])

  const { roleOptions, channelOptions, sessionOptions } = useMemo(() => {
    const roles: string[] = []
    const channels: string[] = []
    const sessions: string[] = []

    const roleOptions: IPropertyItem[] = [{ title: 'all', id: '' }]
    const channelOptions: IPropertyItem[] = [{ title: 'all', id: '' }]
    const sessionOptions: IPropertyItem[] = [{ title: 'all', id: '' }]

    MemoryStore.messages.forEach(el => {
      if (!roles.includes(el.role)) roles.push(el.role)
      if (!channels.includes(el.channel)) channels.push(el.channel)
      if (!sessions.includes(el.session_id)) sessions.push(el.session_id)
    })

    roles.forEach(el => roleOptions.push({
      title: el,
      id: el,
    }))

    channels.forEach(el => channelOptions.push({
      title: el,
      id: el,
    }))

    sessions.forEach(el => sessionOptions.push({
      title: el,
      id: el,
    }))

    return {
      roleOptions,
      channelOptions,
      sessionOptions
    }

  }, [MemoryStore.messages])

  const messages = useMemo(() => {
    return MemoryStore.messages.filter(el => {
      if (role && el.role !== role) return false;
      if (channel && el.channel !== channel) return false;
      if (session && el.session_id !== session) return false;
      return true;
    });
  }, [role, channel, session, MemoryStore.messages]);


  return (
    <Page title="Verbatim">
      <Actions justify="start">
        <Input fill={true} type="select" small={true} value={role} options={roleOptions} onChange={setRole} />
        <Input fill={true} type="select" small={true} value={channel} options={channelOptions} onChange={setChannel} />
        <Input fill={true} type="select" small={true} value={session} options={sessionOptions} onChange={setSession} />
      </Actions>
      <Table
        loaded={!MemoryStore.messagesLoading}
        thead={[
          { title: 'id', width: '10%' },
          { title: 'channel', width: "10%" },
          { title: 'role', width: '6%' },
          { title: 'session', width: '6%' },
          { title: 'created_at', width: '30%' },
          { title: 'metadata' },
          { title: 'content' },
        ]}
        tbody={messages.map(row => {
          return {
            data: [
              `#...${row.id.slice(row.id.length - 8, row.id.length)}`,
              row.channel,
              row.role,
              row.session_id,
              getFormattedDate(new Date(row.created_at), 'hh:mm dd.MM.yyyy'),
              <JsonViewer>{typeof row.metadata === "object" ? row.metadata : JSON.parse(row.metadata)}</JsonViewer>,
              row.content,
            ]
          }
        })}
      />
    </Page>
  )
})