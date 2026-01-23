import { useEffect, useState } from "react";

const MERITS_CACHE_KEY = "github_merits_cache";
const MAPPING_CACHE_KEY = "github_mapping_cache";
const MERITS_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const REPO_OWNER = "BuidlGuidl";
const REPO_NAME = "batch22.buidlguidl.com";

interface MeritStats {
    commits: number;
    issues: number;
    prs: number;
    comments: number;
}

interface CacheData {
    timestamp: number;
    data: Record<string, MeritStats>;
}

// Global queue to prevent multiple hooks from managing their own queues (Singleton pattern simulation)
const resolutionQueue: string[] = [];
let isProcessingQueue = false;

export const useGitHubMerits = () => {
    const [merits, setMerits] = useState<Record<string, MeritStats>>({});
    const [mapping, setMapping] = useState<Record<string, string>>({}); // valid_address -> github_login
    const [isLoading, setIsLoading] = useState(true);

    // Load initial state from cache
    useEffect(() => {
        // 1. Load Mapping Cache (Permanent)
        const mappingString = localStorage.getItem(MAPPING_CACHE_KEY);
        if (mappingString) {
            try {
                setMapping(JSON.parse(mappingString));
            } catch (e) {
                console.error("Error parsing mapping cache", e);
            }
        }

        // 2. Load/Fetch Merits
        const fetchMerits = async () => {
            // Check Cache
            const cachedString = localStorage.getItem(MERITS_CACHE_KEY);
            if (cachedString) {
                try {
                    const cached: CacheData = JSON.parse(cachedString);
                    if (Date.now() - cached.timestamp < MERITS_CACHE_DURATION) {
                        setMerits(cached.data);
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error("Error parsing merits cache", e);
                }
            }

            // Fetch Fresh Data
            try {
                const stats: Record<string, MeritStats> = {};
                const getStats = (login: string) => {
                    if (!stats[login]) stats[login] = { commits: 0, issues: 0, prs: 0, comments: 0 };
                    return stats[login];
                };

                // --- Fetch Commits (Contributors Stats) ---
                const contribRes = await fetch(
                    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/stats/contributors`,
                );
                if (contribRes.ok) {
                    const contributors = await contribRes.json();
                    if (Array.isArray(contributors)) {
                        contributors.forEach((c: any) => {
                            const login = c.author?.login;
                            if (login) getStats(login).commits = c.total || 0;
                        });
                    }
                }

                // --- Fetch Issues & PRs ---
                const issuesRes = await fetch(
                    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=100`,
                );
                if (issuesRes.ok) {
                    const issues = await issuesRes.json();
                    if (Array.isArray(issues)) {
                        issues.forEach((i: any) => {
                            const login = i.user?.login;
                            if (login) {
                                const s = getStats(login);
                                if (i.pull_request) s.prs += 1;
                                else s.issues += 1;
                            }
                        });
                    }
                }

                // --- Fetch Comments ---
                const commentsRes = await fetch(
                    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments?per_page=100`,
                );
                if (commentsRes.ok) {
                    const comments = await commentsRes.json();
                    if (Array.isArray(comments)) {
                        comments.forEach((c: any) => {
                            const login = c.user?.login;
                            if (login) getStats(login).comments += 1;
                        });
                    }
                }

                const newCache: CacheData = { timestamp: Date.now(), data: stats };
                localStorage.setItem(MERITS_CACHE_KEY, JSON.stringify(newCache));
                setMerits(stats);
            } catch (error) {
                console.error("Error fetching GitHub merits:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMerits();
    }, []);

    // Queue Processing Logic
    useEffect(() => {
        const processQueue = async () => {
            if (isProcessingQueue || resolutionQueue.length === 0) return;
            isProcessingQueue = true;

            const address = resolutionQueue.shift();
            if (!address) {
                isProcessingQueue = false;
                return;
            }

            try {
                // Double check cache before fetching (in case another component resolved it)
                const currentMapping = JSON.parse(localStorage.getItem(MAPPING_CACHE_KEY) || "{}");
                if (currentMapping[address]) {
                    setMapping(prev => ({ ...prev, [address]: currentMapping[address] }));
                } else {
                    // Fetch from GitHub
                    // Path: packages/nextjs/app/builders/[address]/page.tsx
                    const res = await fetch(
                        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=packages/nextjs/app/builders/${address}/page.tsx&per_page=1`,
                    );

                    if (res.status === 403 || res.status === 429) {
                        console.warn("GitHub API Rate Limit Hit. Pausing queue.");
                        resolutionQueue.unshift(address); // Put it back
                        setTimeout(() => { isProcessingQueue = false; }, 60000); // 1 min cool down
                        return;
                    }

                    if (res.ok) {
                        const commits = await res.json();
                        if (Array.isArray(commits) && commits.length > 0) {
                            const login = commits[0]?.author?.login; // extract author login
                            if (login) {
                                currentMapping[address] = login;
                                localStorage.setItem(MAPPING_CACHE_KEY, JSON.stringify(currentMapping));
                                setMapping(prev => ({ ...prev, [address]: login }));
                            }
                        }
                    }

                    // Polite delay
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) {
                console.error("Error resolving builder:", e);
            }

            isProcessingQueue = false;
            if (resolutionQueue.length > 0) {
                processQueue(); // Process next
            }
        };

        const interval = setInterval(processQueue, 500); // Check for new items periodically
        return () => clearInterval(interval);
    }, []);

    const resolveBuilder = (address: string) => {
        // If already mapped or in queue, skip
        if (mapping[address] || resolutionQueue.includes(address)) return;

        // Check localStorage one last time synchronously ensuring we don't re-queue known items
        const storedMapping = JSON.parse(localStorage.getItem(MAPPING_CACHE_KEY) || "{}");
        if (storedMapping[address]) {
            setMapping(prev => ({ ...prev, [address]: storedMapping[address] }));
            return;
        }

        resolutionQueue.push(address);
    };

    return { merits, mapping, resolveBuilder, isLoading };
};
