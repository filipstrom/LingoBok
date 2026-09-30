type CaretDocument = Document & {
    caretPositionFromPoint?: (
        x: number,
        y: number,
    ) => {
        offsetNode: Node;
        offset: number;
    } | null;

    caretRangeFromPoint?: (
        x: number,
        y: number,
    ) => Range | null;
};

export type WordPosition = {
    word: string;
    sentence: string;
    x: number;
    y: number;
    bottom: number;
};

const SENTENCE_CONTAINER_TAGS = [
    "P",
    "LI",
    "BLOCKQUOTE",
    "DIV",
];

function getSentenceContainer(
    node: Node,
): HTMLElement | null {
    let element =
        node.nodeType === Node.ELEMENT_NODE
            ? (node as HTMLElement)
            : node.parentElement;

    if (!element) {
        return null;
    }

    while (
        element.parentElement &&
        !SENTENCE_CONTAINER_TAGS.includes(
            element.tagName,
        )
    ) {
        element = element.parentElement;
    }

    return element;
}

function getSentenceAtRangeBoundary(
    range: Range,
    side: "start" | "end",
): string | null {
    const container =
        side === "start"
            ? range.startContainer
            : range.endContainer;

    const offset =
        side === "start"
            ? range.startOffset
            : range.endOffset;

    const element =
        getSentenceContainer(container);

    if (!element) {
        return null;
    }

    const text = element.textContent ?? "";

    if (!text.trim()) {
        return null;
    }

    const beforeRange =
        element.ownerDocument.createRange();

    beforeRange.setStart(element, 0);

    try {
        beforeRange.setEnd(container, offset);
    } catch {
        return null;
    }

    let absoluteOffset =
        beforeRange.toString().length;

    if (
        side === "end" &&
        absoluteOffset > 0
    ) {
        absoluteOffset--;
    }

    const segmenter =
        new Intl.Segmenter(undefined, {
            granularity: "sentence",
        });

    for (
        const part of segmenter.segment(text)
    ) {
        const start = part.index;
        const end =
            start + part.segment.length;

        if (
            absoluteOffset >= start &&
            absoluteOffset < end
        ) {
            return part.segment.trim();
        }
    }

    return null;
}

export function getSentencesInVisibleRange(
    range: Range,
): string[] {
    const segmenter =
        new Intl.Segmenter(undefined, {
            granularity: "sentence",
        });

    const visibleText = range
        .toString()
        .replace(
            /([.!?][»”"]?)(?=\p{Lu})/gu,
            "$1 ",
        )
        .trim();

    if (!visibleText) {
        return [];
    }

    const sentences = Array.from(
        segmenter.segment(visibleText),
        (part) => part.segment.trim(),
    ).filter(
        (sentence) => sentence.length > 1,
    );

    const firstFullSentence =
        getSentenceAtRangeBoundary(
            range,
            "start",
        );

    const lastFullSentence =
        getSentenceAtRangeBoundary(
            range,
            "end",
        );

    if (firstFullSentence) {
        if (sentences.length === 0) {
            sentences.push(firstFullSentence);
        } else {
            sentences[0] =
                firstFullSentence;
        }
    }

    if (lastFullSentence) {
        if (sentences.length === 0) {
            sentences.push(lastFullSentence);
        } else if (
            sentences.length === 1 &&
            sentences[0] !==
                lastFullSentence
        ) {
            sentences.push(lastFullSentence);
        } else {
            sentences[
                sentences.length - 1
            ] = lastFullSentence;
        }
    }

    return [...new Set(sentences)];
}

export function getWordAtPoint(
    doc: Document,
    x: number,
    y: number,
): WordPosition | null {
    const caretDoc = doc as CaretDocument;

    let node: Node | null = null;
    let offset = 0;

    const position =
        caretDoc.caretPositionFromPoint?.(
            x,
            y,
        );

    if (position) {
        node = position.offsetNode;
        offset = position.offset;
    } else {
        const range =
            caretDoc.caretRangeFromPoint?.(
                x,
                y,
            );

        if (range) {
            node = range.startContainer;
            offset = range.startOffset;
        }
    }

    if (
        !node ||
        node.nodeType !== Node.TEXT_NODE
    ) {
        return null;
    }

    const text = node.textContent ?? "";

    const isWordCharacter = (
        character: string,
    ) =>
        /[\p{L}\p{M}'’-]/u.test(
            character,
        );

    if (
        !isWordCharacter(
            text[offset] ?? "",
        ) &&
        offset > 0 &&
        isWordCharacter(
            text[offset - 1] ?? "",
        )
    ) {
        offset--;
    }

    if (
        !isWordCharacter(
            text[offset] ?? "",
        )
    ) {
        return null;
    }

    let start = offset;
    let end = offset;

    while (
        start > 0 &&
        isWordCharacter(
            text[start - 1] ?? "",
        )
    ) {
        start--;
    }

    while (
        end < text.length &&
        isWordCharacter(
            text[end] ?? "",
        )
    ) {
        end++;
    }

    const wordRange = doc.createRange();

    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);

    const rect =
        wordRange.getBoundingClientRect();

    const frame =
        doc.defaultView
            ?.frameElement as HTMLElement | null;

    const frameRect =
        frame?.getBoundingClientRect();

    const frameX = frameRect?.left ?? 0;
    const frameY = frameRect?.top ?? 0;

    let sentence = text;

    const sentenceContainer =
        getSentenceContainer(node);

    if (sentenceContainer) {
        const parentText =
            sentenceContainer.textContent ??
            text;

        const beforeRange =
            doc.createRange();

        beforeRange.setStart(
            sentenceContainer,
            0,
        );

        try {
            beforeRange.setEnd(
                node,
                offset,
            );

            const absoluteOffset =
                beforeRange.toString().length;

            const segmenter =
                new Intl.Segmenter(
                    undefined,
                    {
                        granularity:
                            "sentence",
                    },
                );

            for (
                const part of segmenter.segment(
                    parentText,
                )
            ) {
                const sentenceStart =
                    part.index;
                const sentenceEnd =
                    sentenceStart +
                    part.segment.length;

                if (
                    absoluteOffset >=
                        sentenceStart &&
                    absoluteOffset <=
                        sentenceEnd
                ) {
                    sentence =
                        part.segment.trim();
                    break;
                }
            }
        } catch {
            // Behåll textnoden som fallback.
        }
    }

    return {
        word: text.slice(start, end),
        sentence,
        x:
            frameX +
            rect.left +
            rect.width / 2,
        y: frameY + rect.top,
        bottom: frameY + rect.bottom,
    };
}
