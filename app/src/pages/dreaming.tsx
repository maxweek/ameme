import type { FC, ReactNode } from "react";
import { Brain } from "../components/brain";
import { Page } from "../ui/page/page";
import { Dreaming } from "../components/dreaming";


interface Props {

}

export const DreamingPage: FC<Props> = props => {
  return (
    <Dreaming />
  )
}