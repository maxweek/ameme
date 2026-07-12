import { type FC } from "react";
import './styles.scss';

interface Props {
  text?: string
  children?: React.ReactNode
}

const EmptyBox: FC<Props> = (props: Props) => {
  return (
    <div className={`emptyBox`}>
      <div className={`emptyBox__title`}>
        {props.text || 'Нет результатов'}
      </div>
      {props.children}
    </div>
  )
}

export default EmptyBox;