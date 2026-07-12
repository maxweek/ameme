import { useEffect, type FC, type ReactNode } from "react";
import { Brain } from "../components/brain";
import { Page } from "../ui/page/page";
import { MemoryStore } from "../store/store";
import Input from "../ui/input/input";
import { getRawHtml } from "../helper";

import MDEditor, { commands } from '@uiw/react-md-editor';
import { observer } from "mobx-react-lite";


interface Props {

}

export const StartupPage: FC<Props> = observer(props => {

  useEffect(() => {
    MemoryStore.loadStartup();
  }, [])

  return (
    <Page title="Startup">
      {/* <p dangerouslySetInnerHTML={getRawHtml(MemoryStore.coreMemoryBlock.replaceAll('\n', '<br/>'))} /> */}


      <MDEditor
        value={MemoryStore.coreMemoryBlock}
        contentEditable={false}
        preview="preview"
        hideToolbar={true}
        height={'auto'}
        // height="100%"
        // minHeight={50}
        overflow={false}
        visibleDragbar={false}
      />
    </Page>
  )
})