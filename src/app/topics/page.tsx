import { requireUserId } from "@/auth";
import { getTopics } from "@/lib/dashboard";
import { TopicsBrowser } from "@/components/TopicsBrowser";

export default async function Topics() {
  const userId = await requireUserId();
  const topics = await getTopics(userId);
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Теми</h1>
      <p className="mt-1 text-ink-soft">Натисни на тему — почнеться тест з 10 завдань з поясненнями.</p>
      <TopicsBrowser topics={topics} />
    </div>
  );
}
