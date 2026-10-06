"use client";

import type { TopicDelta } from "@/lib/types";
import { shortName } from "@/lib/topicName";
import { Icon } from "@/components/Icon";
import { ScoreGauge } from "@/components/ScoreGauge";

/** After an answer: the topic's 100–200 score sliding from the old value to the new one, with "+N". */
export function TopicProgress({ topic }: { topic: TopicDelta }) {
  const delta = topic.after - topic.before;
  return (
    <section className="rise mt-4 rounded-2xl bg-card p-4 shadow-[0_0_0_1px_var(--grid)]" aria-live="polite">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{shortName(topic.name)}</p>
        {topic.firstTime ? (
          <span className="text-sm text-ink-soft">перший результат</span>
        ) : delta !== 0 ? (
          <span className={`float-up flex items-center gap-0.5 font-display text-sm font-bold ${delta > 0 ? "text-good" : "text-bad"}`}>
            <Icon name={delta > 0 ? "up" : "down"} className="size-4" />
            {delta > 0 ? `+${delta}` : delta}
          </span>
        ) : (
          <span className="text-sm text-ink-soft">без змін</span>
        )}
      </div>
      <ScoreGauge score={topic.after} from={topic.firstTime ? 100 : topic.before} />
    </section>
  );
}
