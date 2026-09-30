import {
    useEffect,
    useState,
} from "react";

import { Preferences } from "@capacitor/preferences";

import paperTexture from "../assets/textures/paper.webp";
import BookCover from "./bookcover";

import "./Library.css";

export type PaperTheme =
    | "paper"
    | "sepia"
    | "rose"
    | "night";

const paperThemeColors: Record<
    PaperTheme,
    string
> = {
    paper: "#f4efe6",
    sepia: "#e6d3b1",
    rose: "#d9a3a3",
    night: "#3a2a22",
};

const paperThemeNames: Record<
    PaperTheme,
    string
> = {
    paper: "Papper",
    sepia: "Sepia",
    rose: "Ros",
    night: "Natt",
};

const paperTextureUrl =
    new URL(
        paperTexture,
        window.location.href,
    ).href;

const PAPER_THEME_KEY =
    "reader-paper-theme";

const READER_FONT_SCALE_KEY =
    "reader-font-scale";

const POPUP_FONT_SCALE_KEY =
    "translation-popup-font-scale";

export type LibraryBook = {
    id: string;
    file: File;
    title: string;
    coverUrl?: string;
    language?: string;
};

type LibraryProps = {
    books: LibraryBook[];
    isNative: boolean;
    onChooseFolder: () => void;
    onAddBook: (file: File) => void;
    onBookClick: (
        book: LibraryBook,
    ) => void;
};

export default function Library({
    books,
    isNative,
    onChooseFolder,
    onAddBook,
    onBookClick,
}: LibraryProps) {
    const [
        settingsOpen,
        setSettingsOpen,
    ] = useState(false);

    const [
        currentPaperTheme,
        setCurrentPaperTheme,
    ] =
        useState<PaperTheme>("paper");

    const [
        readerFontScale,
        setReaderFontScale,
    ] = useState(100);

    const [
        popupFontScale,
        setPopupFontScale,
    ] = useState(100);

    useEffect(() => {
        const loadSettings =
            async () => {
                const [
                    themeResult,
                    readerScaleResult,
                    popupScaleResult,
                ] =
                    await Promise.all([
                        Preferences.get({
                            key: PAPER_THEME_KEY,
                        }),

                        Preferences.get({
                            key: READER_FONT_SCALE_KEY,
                        }),

                        Preferences.get({
                            key: POPUP_FONT_SCALE_KEY,
                        }),
                    ]);

                const theme =
                    themeResult.value;

                if (
                    theme === "paper" ||
                    theme === "sepia" ||
                    theme === "rose" ||
                    theme === "night"
                ) {
                    setCurrentPaperTheme(
                        theme,
                    );
                }

                if (
                    readerScaleResult.value
                ) {
                    const scale =
                        Number(
                            readerScaleResult.value,
                        );

                    if (
                        Number.isFinite(
                            scale,
                        )
                    ) {
                        setReaderFontScale(
                            scale,
                        );
                    }
                }

                if (
                    popupScaleResult.value
                ) {
                    const scale =
                        Number(
                            popupScaleResult.value,
                        );

                    if (
                        Number.isFinite(
                            scale,
                        )
                    ) {
                        setPopupFontScale(
                            scale,
                        );

                        document.documentElement.style
                            .setProperty(
                                "--translation-popup-scale",
                                String(
                                    scale /
                                    100,
                                ),
                            );
                    }
                }
            };

        void loadSettings();
    }, []);

    const changePaperTheme = (
        theme: PaperTheme,
    ) => {
        setCurrentPaperTheme(theme);

        void Preferences.set({
            key: PAPER_THEME_KEY,
            value: theme,
        });
    };

    const changeReaderFontScale = (
        scale: number,
    ) => {
        setReaderFontScale(scale);

        void Preferences.set({
            key: READER_FONT_SCALE_KEY,
            value: String(scale),
        });
    };

    const changePopupFontScale = (
        scale: number,
    ) => {
        setPopupFontScale(scale);

        /*
         * Gör ändringen tillgänglig direkt
         * för TranslationPopup.css.
         */
        document.documentElement.style
            .setProperty(
                "--translation-popup-scale",
                String(scale / 100),
            );

        void Preferences.set({
            key: POPUP_FONT_SCALE_KEY,
            value: String(scale),
        });
    };

    const handleWebFile = (
        event:
            React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file =
            event.target.files?.[0];

        if (file) {
            void onAddBook(file);
        }

        event.target.value = "";
    };

    return (
        <main className="library">
            <header className="library-header">
                <div />

                <h1 className="library-header__title">
                    LingoBok
                </h1>

                <div className="library-header__actions">
                    <button
                        className="library-icon-button"
                        type="button"
                        onClick={() =>
                            setSettingsOpen(
                                (open) =>
                                    !open,
                            )
                        }
                        aria-label="Läsinställningar"
                        aria-expanded={
                            settingsOpen
                        }
                    >
                        ⚙
                    </button>

                    {isNative ? (
                        <button
                            className="library-icon-button"
                            type="button"
                            onClick={
                                onChooseFolder
                            }
                            aria-label="Välj biblioteksmapp"
                        >
                            📁
                        </button>
                    ) : (
                        <label className="library-test-button">
                            Open EPUB

                            <input
                                hidden
                                type="file"
                                accept=".epub,application/epub+zip"
                                onChange={
                                    handleWebFile
                                }
                            />
                        </label>
                    )}
                </div>
            </header>

            {settingsOpen && (
                <>
                    <button
                        className="library-settings-backdrop"
                        type="button"
                        onClick={() =>
                            setSettingsOpen(false)
                        }
                        aria-label="Stäng inställningar"
                    />

                    <section
                        className="library-settings"
                        aria-label="Läsinställningar"
                    >
                        <div className="library-settings__title-row">
                            <h2>
                                Läsinställningar
                            </h2>

                            <button
                                className="library-settings__close"
                                type="button"
                                onClick={() =>
                                    setSettingsOpen(false)
                                }
                                aria-label="Stäng inställningar"
                            >
                                ×
                            </button>
                        </div>

                        <div className="library-setting">
                            <span className="library-setting__label">
                                Tema
                            </span>

                            <div className="theme-picker">
                                {(
                                    Object.keys(
                                        paperThemeColors,
                                    ) as PaperTheme[]
                                ).map(
                                    (theme) => (
                                        <button
                                            key={theme}
                                            className={`theme-option${currentPaperTheme === theme
                                                ? " theme-option--selected"
                                                : ""
                                                }`}
                                            type="button"
                                            onClick={() =>
                                                changePaperTheme(
                                                    theme,
                                                )
                                            }
                                            aria-pressed={
                                                currentPaperTheme === theme
                                            }
                                        >
                                            <span
                                                className="theme-option__color"
                                                style={{
                                                    backgroundColor:
                                                        paperThemeColors[
                                                        theme
                                                        ],
                                                }}
                                            />

                                            <span>
                                                {
                                                    paperThemeNames[
                                                    theme
                                                    ]
                                                }
                                            </span>
                                        </button>
                                    ),
                                )}
                            </div>
                        </div>

                        <div className="library-setting">
                            <div className="library-setting__row">
                                <label
                                    htmlFor="reader-font-scale"
                                    className="library-setting__label"
                                >
                                    Boktext
                                </label>

                                <span className="library-setting__value">
                                    {readerFontScale}%
                                </span>
                            </div>

                            <input
                                id="reader-font-scale"
                                className="library-setting__slider"
                                type="range"
                                min="70"
                                max="200"
                                step="5"
                                value={readerFontScale}
                                onChange={(event) =>
                                    changeReaderFontScale(
                                        Number(
                                            event.target.value,
                                        ),
                                    )
                                }
                            />
                        </div>

                        <div className="library-setting">
                            <div className="library-setting__row">
                                <label
                                    htmlFor="popup-font-scale"
                                    className="library-setting__label"
                                >
                                    Popuptext
                                </label>

                                <span className="library-setting__value">
                                    {popupFontScale}%
                                </span>
                            </div>

                            <input
                                id="popup-font-scale"
                                className="library-setting__slider"
                                type="range"
                                min="70"
                                max="200"
                                step="5"
                                value={popupFontScale}
                                onChange={(event) =>
                                    changePopupFontScale(
                                        Number(
                                            event.target.value,
                                        ),
                                    )
                                }
                            />
                        </div>
                    </section>
                </>
            )}

            <p className="library-subtitle">
                Your library
            </p>

            <section
                className="library-grid"
                aria-label="Bookshelf"
            >
                {books.map((book) => (
                    <button
                        className="book-card"
                        key={book.id}
                        type="button"
                        onClick={() =>
                            onBookClick(
                                book,
                            )
                        }
                    >
                        <BookCover
                            title={
                                book.title
                            }
                            coverUrl={
                                book.coverUrl
                            }
                            pageColor={
                                paperThemeColors[
                                currentPaperTheme
                                ]
                            }
                            pageTexture={`url("${paperTextureUrl}")`}
                        />

                        <span className="book-title">
                            {book.title}
                        </span>
                    </button>
                ))}
            </section>
        </main>
    );
}