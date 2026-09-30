import type { CSSProperties } from "react";
export type BookCoverProps = {
    title: string;
    coverUrl?: string;
    pageColor: string;
    pageTexture: string;
};

export default function BookCover({ title, coverUrl, pageColor, pageTexture }: BookCoverProps) {
    return (
        <div
            className="book-3d"
            style={{ "--page-color": pageColor, "--page-texture": pageTexture } as CSSProperties}
        >
            <div className="book-back-cover" />
            <div className="book-pages" />
            <div className="book-front-cover">
                {coverUrl ? (
                    <img src={coverUrl} alt={`Cover of ${title}`} />
                ) : (
                    <div className="book-cover-placeholder" aria-label={`Cover of ${title}`}>
                        No cover
                    </div>
                )}
            </div>
        </div>
    );
}
