import {
    useCallback,
    useEffect,
    useRef,
} from "react";

import { prefetchPage } from "../services/llm";

type PrefetchJob = {
    sentences: string[];
    language: string;
    generation: number;
};

export function usePagePrefetch(
    language?: string,
    delayMs = 1000,
) {
    const timerRef =
        useRef<number | null>(null);

    /*
     * Ökar varje gång användaren byter sida.
     *
     * Ett gammalt jobb kan då se att det inte
     * längre tillhör den aktuella sidan.
     */
    const generationRef =
        useRef(0);

    /*
     * Det får bara finnas ett väntande jobb:
     * den SENASTE sidan.
     */
    const latestJobRef =
        useRef<PrefetchJob | null>(null);

    /*
     * Hindrar flera workers från att köra
     * samtidigt.
     */
    const runningRef =
        useRef(false);


    const runWorker =
        useCallback(async () => {
            if (runningRef.current) {
                return;
            }

            runningRef.current = true;

            try {
                while (latestJobRef.current) {
                    /*
                     * Ta senaste jobbet.
                     *
                     * Om användaren byter sida medan
                     * detta körs kommer latestJobRef
                     * senare innehålla den nya sidan.
                     */
                    const job =
                        latestJobRef.current;

                    latestJobRef.current =
                        null;

                    try {
                        await prefetchPage(
                            job.sentences,
                            job.language,

                            /*
                             * prefetchPage frågar detta
                             * mellan sina batchar.
                             *
                             * Den batch som redan kör
                             * får avslutas och sparas,
                             * men inga fler gamla batchar
                             * startas.
                             */
                            () =>
                                job.generation ===
                                generationRef.current,
                        );
                    } catch (error) {
                        console.error(
                            "PREFETCH ERROR:",
                            error,
                        );
                    }
                }
            } finally {
                runningRef.current = false;

                /*
                 * Skydd mot ett litet race:
                 *
                 * Om ett nytt jobb kom precis när
                 * workern höll på att avslutas,
                 * starta workern igen.
                 */
                if (latestJobRef.current) {
                    void runWorker();
                }
            }
        }, []);


    const schedulePrefetch =
        useCallback(
            (sentences: string[]) => {
                /*
                 * Så fort sidan ändras blir det gamla
                 * jobbet inaktuellt.
                 */
                generationRef.current++;

                const generation =
                    generationRef.current;


                /*
                 * Ta bort en gammal väntande timer.
                 *
                 * Om användaren bläddrar snabbt kommer
                 * vi därför bara starta prefetchen för
                 * sidan de faktiskt stannar på.
                 */
                if (
                    timerRef.current !== null
                ) {
                    window.clearTimeout(
                        timerRef.current,
                    );

                    timerRef.current =
                        null;
                }


                if (sentences.length === 0) {
                    latestJobRef.current =
                        null;

                    return;
                }


                timerRef.current =
                    window.setTimeout(
                        () => {
                            /*
                             * Användaren kan ha hunnit
                             * byta sida medan timern
                             * väntade.
                             */
                            if (
                                generation !==
                                generationRef.current
                            ) {
                                return;
                            }


                            /*
                             * Ersätt eventuellt väntande
                             * jobb med den senaste sidan.
                             *
                             * Latest page wins.
                             */
                            latestJobRef.current = {
                                sentences,
                                language:
                                    language ??
                                    "unknown",
                                generation,
                            };


                            void runWorker();

                            timerRef.current =
                                null;
                        },
                        delayMs,
                    );
            },
            [
                delayMs,
                language,
                runWorker,
            ],
        );


    useEffect(() => {
        return () => {
            /*
             * Gör alla pågående jobb gamla.
             */
            generationRef.current++;

            latestJobRef.current =
                null;

            if (
                timerRef.current !== null
            ) {
                window.clearTimeout(
                    timerRef.current,
                );

                timerRef.current =
                    null;
            }
        };
    }, []);


    return schedulePrefetch;
}