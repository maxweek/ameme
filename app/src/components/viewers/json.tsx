import type { FC } from "react";
import JsonView from '@uiw/react-json-view';
import { vscodeTheme } from '@uiw/react-json-view/vscode';
import { TriangleSolidArrow } from "@uiw/react-json-view/triangle-solid-arrow";


interface Props {
  children: object;
  collapsed?: number | boolean
}

export const JsonViewer: FC<Props> = props => {
  return (
    <JsonView
      style={{...vscodeTheme, width: "100%"}}
      collapsed={props.collapsed ?? false}
      displayDataTypes={false}
      displayObjectSize={false}
      value={props.children}
      enableClipboard={false}
    >
      <JsonView.Arrow>
        <TriangleSolidArrow />
      </JsonView.Arrow>
      <JsonView.Quote > </JsonView.Quote>
    </JsonView>
  )
}