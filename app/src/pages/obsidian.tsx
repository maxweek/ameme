import { useState, type FC } from "react";
import { Page } from "../ui/page/page";
import { DocViewer } from "../components/docViewer";
import { Selector } from "../ui/selector/selector";


interface Props {

}

export const ObsidianPage: FC<Props> = props => {
  const [graphVisible, setGraphVisible] = useState<boolean>(true)

  return (
    <Page title="Obsidian" actions={
      <Selector
        value={graphVisible}
        options={[
          { title: 'graph', value: true },
          { title: 'list', value: false },
        ]}
        onChange={el => {
          setGraphVisible(el.value)
        }}
      />
    }>
      <DocViewer graphVisible={graphVisible} />
    </Page>
  )
}