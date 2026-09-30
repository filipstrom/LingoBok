import {
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import ReactMarkdown from "react-markdown";

import "./TranslationPopup.css";

type TranslationPopupProps = {
    word: string;
    x: number;
    y: number;
    bottom: number;
    explanation?: string;
    showSentenceTranslation?: boolean;
    onClose: () => void;
    onRefresh?: () => void | Promise<void>;
    onAskPageQuestion?: () => void;
};

export default function TranslationPopup({
    word,
    x,
    y,
    bottom,
    explanation = "",
    showSentenceTranslation = false,
    onClose,
    onRefresh,
    onAskPageQuestion,
}: TranslationPopupProps) {
    const [showMore, setShowMore] =
        useState(false);

    const [refreshing, setRefreshing] =
        useState(false);

    const explanationMatch =
        explanation.match(
            /(?:^|\n)\s*[-*]?\s*\*\*Förklaring:\*\*\s*/i,
        );

    const sentenceMatch =
        explanation.match(
            /(?:^|\n)\s*[-*]?\s*\*\*Meningsöversättning:\*\*\s*/i,
        );

    const meaningMatch =
        explanation.match(
            /\*\*Betydelse:\*\*\s*([^\n]+)/i,
        );

    const baseFormMatch =
        explanation.match(
            /\*\*Grundform:\*\*\s*([^\n]+)/i,
        );

    const meaning =
        meaningMatch?.[1]?.trim() ?? "";

    const baseForm =
        baseFormMatch?.[1]?.trim() ?? "";

    const explanationIndex =
        explanationMatch?.index;

    const sentenceIndex =
        sentenceMatch?.index;

    const shortText =
        explanationIndex !== undefined
            ? explanation
                .slice(
                    0,
                    explanationIndex,
                )
                .trim()
            : sentenceIndex !== undefined
                ? explanation
                    .slice(
                        0,
                        sentenceIndex,
                    )
                    .trim()
                : explanation;

    const detailedText =
        explanationIndex !== undefined &&
            explanationMatch
            ? explanation
                .slice(
                    explanationIndex +
                    explanationMatch[0]
                        .length,
                    sentenceIndex,
                )
                .trim()
            : "";

    const sentenceTranslation =
        sentenceIndex !== undefined &&
            sentenceMatch
            ? explanation
                .slice(
                    sentenceIndex +
                    sentenceMatch[0]
                        .length,
                )
                .trim()
            : "";

    const isLoading =
        refreshing ||
        explanation.trim() ===
        "Översätter...";

    const hasResult =
        showSentenceTranslation
            ? Boolean(
                sentenceTranslation,
            )
            : Boolean(
                meaning || shortText,
            );

    const canShowMore =
        !showSentenceTranslation &&
        Boolean(
            baseForm ||
            detailedText,
        );

    const popupRef =
        useRef<HTMLElement>(null);

    const [safeX, setSafeX] =
        useState(x);

    const [safeTop, setSafeTop] =
        useState(y - 12);

    const showBelow = y < 160;

    useLayoutEffect(() => {
        const popup =
            popupRef.current;

        if (!popup) {
            return;
        }

        const margin = 12;

        const {
            width,
            height,
        } =
            popup.getBoundingClientRect();

        const minX =
            width / 2 + margin;

        const maxX =
            window.innerWidth -
            width / 2 -
            margin;

        setSafeX(
            Math.max(
                minX,
                Math.min(
                    x,
                    maxX,
                ),
            ),
        );

        const verticalMargin =
            12;

        if (showBelow) {
            const desiredTop =
                bottom + 12;

            const maxTop =
                window.innerHeight -
                height -
                verticalMargin;

            setSafeTop(
                Math.max(
                    verticalMargin,
                    Math.min(
                        desiredTop,
                        maxTop,
                    ),
                ),
            );
        } else {
            const desiredAnchor =
                y - 12;

            const minimumAnchor =
                height +
                verticalMargin;

            setSafeTop(
                Math.max(
                    minimumAnchor,
                    desiredAnchor,
                ),
            );
        }
    }, [
        x,
        y,
        bottom,
        word,
        explanation,
        showSentenceTranslation,
        showMore,
        showBelow,
    ]);

    const handleRefresh =
        async () => {
            if (
                !onRefresh ||
                refreshing
            ) {
                return;
            }

            setRefreshing(true);

            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
            }
        };

    return (
        <>
            <button
                className="translation-backdrop"
                type="button"
                onClick={onClose}
                aria-label="Stäng översättning"
            />

            <aside
                ref={popupRef}
                className={`translation-popup${showBelow
                    ? " translation-popup--below"
                    : ""
                    }`}
                style={{
                    left: safeX,
                    top: safeTop,
                }}
                aria-live="polite"
            >
                {showSentenceTranslation ? (
                    <div className="translation-popup__header">
                        {isLoading ? (
                            <>
                                <div className="translation-popup__header-side" />

                                <button
                                    className="translation-popup__corner-button translation-popup__corner-button--loading"
                                    style={{
                                        justifySelf:
                                            "center",
                                    }}
                                    type="button"
                                    disabled
                                    aria-label="Översätter mening"
                                >
                                    ↻
                                </button>

                                <div className="translation-popup__header-side" />
                            </>
                        ) : (
                            <>
                                <div className="translation-popup__header-side">
                                    {showSentenceTranslation ? (
                                        onAskPageQuestion && (
                                            <button
                                                className="translation-popup__corner-button"
                                                type="button"
                                                onClick={onAskPageQuestion}
                                                aria-label="Fråga om sidan"
                                                title="Fråga om sidan"
                                            >
                                                ?
                                            </button>
                                        )
                                    ) : (
                                        canShowMore &&
                                        !isLoading && (
                                            <button
                                                className="translation-popup__corner-button"
                                                type="button"
                                                onClick={() =>
                                                    setShowMore(
                                                        (value) => !value,
                                                    )
                                                }
                                                aria-label={
                                                    showMore
                                                        ? "Visa mindre"
                                                        : "Visa mer"
                                                }
                                                title={
                                                    showMore
                                                        ? "Visa mindre"
                                                        : "Visa mer"
                                                }
                                            >
                                                {showMore ? "−" : "…"}
                                            </button>
                                        )
                                    )}
                                </div>

                                <span aria-hidden="true" />


                                <div className="translation-popup__header-side">
                                    {hasResult && (
                                        <button
                                            className="translation-popup__corner-button"
                                            type="button"
                                            onClick={
                                                handleRefresh
                                            }
                                            disabled={
                                                !onRefresh
                                            }
                                            aria-label="Generera ny meningsöversättning"
                                            title="Generera ny meningsöversättning"
                                        >
                                            ↻
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="translation-popup__header">
                        <div className="translation-popup__header-side">
                            {canShowMore &&
                                !isLoading && (
                                    <button
                                        className="translation-popup__corner-button"
                                        type="button"
                                        onClick={() =>
                                            setShowMore(
                                                (
                                                    value,
                                                ) =>
                                                    !value,
                                            )
                                        }
                                        aria-label={
                                            showMore
                                                ? "Visa mindre"
                                                : "Visa mer"
                                        }
                                        title={
                                            showMore
                                                ? "Visa mindre"
                                                : "Visa mer"
                                        }
                                    >
                                        {showMore
                                            ? "−"
                                            : "…"}
                                    </button>
                                )}
                        </div>

                        <strong className="translation-popup__word">
                            {word}
                        </strong>

                        <div className="translation-popup__header-side">
                            {(hasResult ||
                                isLoading) && (
                                    <button
                                        className={`translation-popup__corner-button${isLoading
                                            ? " translation-popup__corner-button--loading"
                                            : ""
                                            }`}
                                        type="button"
                                        onClick={
                                            handleRefresh
                                        }
                                        disabled={
                                            isLoading ||
                                            !onRefresh
                                        }
                                        aria-label="Fråga modellen igen"
                                        title="Fråga modellen igen"
                                    >
                                        ↻
                                    </button>
                                )}
                        </div>
                    </div>
                )}

                <div
                    className={`translation-popup__content${!showSentenceTranslation
                        ? " translation-popup__content--word"
                        : ""
                        }`}
                >
                    {!isLoading &&
                        (showSentenceTranslation ? (
                            sentenceTranslation ? (
                                <ReactMarkdown>
                                    {
                                        sentenceTranslation
                                    }
                                </ReactMarkdown>
                            ) : null
                        ) : (
                            <>
                                <ReactMarkdown>
                                    {meaning ||
                                        shortText}
                                </ReactMarkdown>

                                {showMore && (
                                    <>
                                        {baseForm && (
                                            <ReactMarkdown>
                                                {`**Grundform:** ${baseForm}`}
                                            </ReactMarkdown>
                                        )}

                                        {detailedText && (
                                            <ReactMarkdown>
                                                {`**Förklaring:** ${detailedText}`}
                                            </ReactMarkdown>
                                        )}
                                    </>
                                )}
                            </>
                        ))}
                </div>
            </aside>
        </>
    );
}
