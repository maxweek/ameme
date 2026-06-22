console.log("Hello, world!");


import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "demo",
  version: "1.0.0",
  
});


const todos = new Map<string, string>();

server.addTool({
  name: "createTodo",
  description: "Создать задачу",
  parameters: z.object({
    id: z.string(),
    text: z.string(),
  }),
  execute: async ({ id, text }) => {
    todos.set(id, text);
    return `Created: ${id}`;
  },
});

server.addTool({
  name: "listTodos",
  description: "Получить список задач",
  parameters: z.object({}),
  execute: async () => {
    return [...todos.entries()]
      .map(([id, text]) => `${id}: ${text}`)
      .join("\n");
  },
});


server.start({
  transportType: "httpStream",
  httpStream: {
    port: 3000,
  },
});