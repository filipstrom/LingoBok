import { useEffect, useRef } from "react";
import "./App.css";

// Foliate registrerar <foliate-view>
import "./lib/foliate-js/view.js";
type CaretDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number
  ) => {
    offsetNode: Node;
    offset: number;
  } | null;

  caretRangeFromPoint?: (
    x: number,
    y: number
  ) => Range | null;
};

function getWordAtPoint(
  doc: Document,
  x: number,
  y: number
): string | null {
  const caretDoc = doc as CaretDocument;

  let node: Node | null = null;
  let offset = 0;

  // Firefox / modern API
  const position = caretDoc.caretPositionFromPoint?.(x, y);

  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else {
    // Chrome / WebView fallback
    const range = caretDoc.caretRangeFromPoint?.(x, y);

    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const text = node.textContent ?? "";

  const isWordCharacter = (character: string) =>
    /[\p{L}\p{M}'’-]/u.test(character);

  // Klick kan hamna precis efter sista bokstaven
  if (
    !isWordCharacter(text[offset] ?? "") &&
    offset > 0 &&
    isWordCharacter(text[offset - 1])
  ) {
    offset--;
  }

  if (!isWordCharacter(text[offset] ?? "")) {
    return null;
  }

  let start = offset;
  let end = offset;

  while (start > 0 && isWordCharacter(text[start - 1])) {
    start--;
  }

  while (end < text.length && isWordCharacter(text[end])) {
    end++;
  }

  return text.slice(start, end);
}
function App() {
  const readerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reader = readerRef.current;

    if (!reader) return;

    const handleRelocate = (event: Event) => {
      console.log("Reading position changed:", event);
    };

    const handleLoad = (event: Event) => {
      const customEvent = event as CustomEvent<{
        doc: Document;
        index: number;
      }>;

      const doc = customEvent.detail.doc;

      console.log("Loaded EPUB section:", customEvent.detail.index);

      doc.addEventListener("click", (event) => {
        const mouseEvent = event as MouseEvent;

        const word = getWordAtPoint(
          doc,
          mouseEvent.clientX,
          mouseEvent.clientY
        );

        if (word) {
          console.log("WORD:", word);
        }
      });
    };

    reader.addEventListener("relocate", handleRelocate);
    reader.addEventListener("load", handleLoad);

    return () => {
      reader.removeEventListener("relocate", handleRelocate);
      reader.removeEventListener("load", handleLoad);
    };
  }, []);

  async function openBook(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !readerRef.current) return;

    const reader = readerRef.current as HTMLElement & {
      open: (file: File) => Promise<void>;
      goTo: (target: number | string) => Promise<void>;
    };

    try {
      console.log("Opening:", file.name);

      await reader.open(file);

      console.log("Book opened");

      await reader.goTo(0);

      console.log("Moved to first section");
    } catch (error) {
      console.error("Failed to open EPUB:", error);
    }
  }
  function nextPage() {
    const reader = readerRef.current as HTMLElement & {
      next: () => Promise<void>;
    };

    reader.next();
  }

  function prevPage() {
    const reader = readerRef.current as HTMLElement & {
      prev: () => Promise<void>;
    };

    reader.prev();
  }

  return (
    <main>
      <input
        type="file"
        accept=".epub,application/epub+zip"
        onChange={openBook}
      />
      <div>
        <button onClick={prevPage}>Previous</button>
        <button onClick={nextPage}>Next</button>
      </div>

      <foliate-view ref={readerRef}></foliate-view>
    </main>
  );
}

export default App;