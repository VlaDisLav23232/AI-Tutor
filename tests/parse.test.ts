import { describe, expect, it } from "vitest";
import { parseInlineOptions, parseMatchingText, stripPageDebris } from "@/lib/parse";

describe("parseMatchingText", () => {
  it("parses items followed by options", () => {
    const r = parseMatchingText(
      "Доберіть фразеологізм. 1 Перше речення […]. 2 Друге […]. 3 Третє […]. 4 Четверте […]. А поставити під удар Б поставити на ноги В поставити перед фактом Г поставити на карту Д поставити на перший план",
    );
    expect(r?.items).toEqual({ "1": "Перше речення […].", "2": "Друге […].", "3": "Третє […].", "4": "Четверте […]." });
    expect(r?.options["Д"]).toBe("поставити на перший план");
    expect(r?.question).toBe("Доберіть фразеологізм.");
  });

  it("untangles items and options interleaved by two-column extraction", () => {
    const r = parseMatchingText(
      "Доберіть (1 – 4) до (А – Д). 1 Речення один. А ставити під сумнів Б поставити на ноги 2 Речення два. В поставити питання руба Г поставити крапку 3 Речення три. Д розставити тенета 4 Речення чотири.",
    );
    expect(r?.items["2"]).toBe("Речення два.");
    expect(r?.items["4"]).toBe("Речення чотири.");
    expect(r?.options["Б"]).toBe("поставити на ноги");
    expect(r?.options["Д"]).toBe("розставити тенета");
  });

  it("drops page-number debris and handles the (1)word format", () => {
    const debris = parseMatchingText("Q 1 a 2 b 3 c 4 d. 8 ⟦ВІ⟧ А x Б y В z Г w Д v");
    expect(debris?.items["4"]).toBe("d.");
    const words = parseMatchingText("Визначте. Життя довело ⟦(1)всім, (2)навіть⟧ найбільшим ⟦, (3)що⟧ ⟦(4)майбутнє⟧ варте. А іменник Б займенник В частка Г прийменник Д сполучник");
    expect(words?.items).toEqual({ "1": "всім", "2": "навіть", "3": "що", "4": "майбутнє" });
  });
});

describe("parseInlineOptions", () => {
  it("moves option letters out of highlights", () => {
    const r = parseInlineOptions("Однаковий звук у рядку А ⟦с⟧вято, ⟦с⟧яйво ⟦Б д⟧жміль, ⟦д⟧ужечка В ке⟦т⟧чуп Г ⟦к⟧рай");
    expect(r?.question).toBe("Однаковий звук у рядку");
    expect(r?.options["Б"]).toBe("⟦д⟧жміль, ⟦д⟧ужечка");
    expect(Object.keys(r!.options)).toEqual(["А", "Б", "В", "Г"]);
  });
});

describe("stripPageDebris", () => {
  it("removes page headers glued to the last option", () => {
    expect(stripPageDebris("тризуб, перевезт⟦и⟧ др⟦о⟧ва ⟦08 червня 2026⟧")).toBe("тризуб, перевезт⟦и⟧ др⟦о⟧ва");
    expect(stripPageDebris("гарбузин..я ⟦23 травня 2026⟧ 5")).toBe("гарбузин..я");
    expect(stripPageDebris("п⟦і⟧длітковий ЩОДЕННИК АБІТУРІЄНТА")).toBe("п⟦і⟧длітковий");
    expect(stripPageDebris("Подія 8 червня стала важливою")).toBe("Подія 8 червня стала важливою");
  });
});
