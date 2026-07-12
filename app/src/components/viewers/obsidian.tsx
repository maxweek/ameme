import MDEditor from "@uiw/react-md-editor";
import type { FC } from "react";

interface Props {
  content?: string;
  onNavigate?: (path: string) => void;
}

export const ObsidianViewer: FC<Props> = ({ content, onNavigate }) => {
  // Заменить [[path]] на кликабельные ссылки
  const processed = content?.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, path) => {
      const name = path.split('/').pop()?.replace('.md', '') ?? path;
      return `[${path}](obsidian://${path})`;
    }
  );

  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href') ?? '';
        if (href.startsWith('obsidian://')) {
          e.preventDefault();
          const path = decodeURIComponent(href.replace('obsidian://', ''));
          onNavigate(path);
        }
      }}
    >

      <MDEditor.Markdown source={processed} />
    </div>
  );
};