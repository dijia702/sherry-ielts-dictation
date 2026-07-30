import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import type { QuizData } from "./types";

async function bootstrap() {
  const root = createRoot(document.getElementById("root")!);
  try {
    const response = await fetch(new URL("data/quiz-data.json", document.baseURI));
    if (!response.ok) throw new Error(`Quiz data request failed: ${response.status}`);
    const data = (await response.json()) as QuizData;
    root.render(<App data={data} />);
  } catch (error) {
    root.render(
      <main className="boot-error">
        <h1>题库加载失败</h1>
        <p>{error instanceof Error ? error.message : "无法读取本地题库"}</p>
      </main>,
    );
  }
}

void bootstrap();
