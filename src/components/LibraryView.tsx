import { Play, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { buildPageGroups } from "../lib/quiz";
import type { CollectionId, CollectionScope, QuizData, QuizQuestion } from "../types";

interface LibraryViewProps {
  data: QuizData;
  initialScope: CollectionScope;
  onPlay: (question: QuizQuestion) => void;
  onResetCollectionProgress: (collectionId: CollectionId) => void;
}

const SCOPE_OPTIONS: Array<{ value: CollectionScope; label: string }> = [
  { value: "jian21", label: "剑21" },
  { value: "jijing_supplement", label: "补充机经" },
  { value: "xiahua_p1p4", label: "虾滑P1/P4" },
  { value: "all", label: "全部" },
];

export default function LibraryView({
  data,
  initialScope,
  onPlay,
  onResetCollectionProgress,
}: LibraryViewProps) {
  const [scope, setScope] = useState<CollectionScope>(initialScope);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchingQuestions = data.questions.filter((question) => {
      const searchable = `${question.sourceHeadword} ${question.acceptedAnswers.join(" ")} ${question.meaningZh}`
        .toLocaleLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
    return buildPageGroups(matchingQuestions, scope);
  }, [data.questions, query, scope]);

  const visibleCount = groups.reduce((total, group) => total + group.questions.length, 0);

  return (
    <main className="library-panel">
      <div className="library-toolbar">
        <div className="library-heading">
          <div>
            <h2>词库浏览</h2>
            <p>{visibleCount} 个词条 · 每组最多 25 个</p>
          </div>
          <div className="segmented-control" aria-label="选择浏览词库">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={scope === option.value ? "is-active" : ""}
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {scope !== "all" && (
            <button
              type="button"
              className="quiet-button compact library-reset-button"
              onClick={() => onResetCollectionProgress(scope)}
            >
              <RotateCcw size={16} />
              重置本词库进度
            </button>
          )}
        </div>
        <label className="library-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词、变体或中文释义"
            aria-label="搜索词库"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="library-groups">
        {groups.length === 0 ? (
          <div className="library-empty">没有匹配的词条</div>
        ) : (
          groups.map((group) => {
            const headingId = `library-${group.key.replaceAll(":", "-")}`;
            const collectionLabel =
              data.collections.find((item) => item.id === group.collectionId)?.label ?? "词表";
            return (
              <section className="library-group" key={group.key} aria-labelledby={headingId}>
                <div className="library-group-heading">
                  <div>
                    <h3 id={headingId}>第 {group.page} 页</h3>
                    <span>{collectionLabel}</span>
                  </div>
                  <span>
                    {group.partCount > 1 ? `第 ${group.part}/${group.partCount} 组 · ` : ""}
                    {group.questions.length} 词
                  </span>
                </div>
                <ol
                  className="library-word-grid"
                  data-testid={`library-group-${group.key.replaceAll(":", "-")}`}
                >
                  {group.questions.map((question) => (
                    <li key={question.id}>
                      <div className="library-word-meta">
                        <span>{String(question.number).padStart(2, "0")}</span>
                        <button
                          type="button"
                          className="library-play-button"
                          aria-label={`播放 ${question.canonicalAnswer}`}
                          title="播放"
                          onClick={() => onPlay(question)}
                        >
                          <Play size={15} fill="currentColor" />
                        </button>
                      </div>
                      <strong>{question.canonicalAnswer}</strong>
                      {question.acceptedAnswers.length > 1 && (
                        <small>{question.acceptedAnswers.join(" / ")}</small>
                      )}
                      <p>
                        <span className="library-part-of-speech">{question.partOfSpeech}</span>
                        {question.meaningZh}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
