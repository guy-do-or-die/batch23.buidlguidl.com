import { useEffect } from "react";
import { useGitHubMerits } from "~~/hooks/useGitHubMerits";

interface BuilderMeritsProps {
    owner: string;
}

export const BuilderMerits = ({ owner }: BuilderMeritsProps) => {
    const { merits, mapping, resolveBuilder } = useGitHubMerits();
    const githubUsername = mapping[owner];
    const userMerits = githubUsername ? merits[githubUsername] : null;

    useEffect(() => {
        resolveBuilder(owner);
    }, [owner, resolveBuilder]);

    if (!userMerits) return null;

    return (
        <div className="flex gap-2 mt-2 text-xs">
            {userMerits.commits > 0 && (
                <div className="badge badge-ghost gap-1" title="Commits">
                    <span>💻</span> {userMerits.commits}
                </div>
            )}
            {userMerits.issues > 0 && (
                <div className="badge badge-ghost gap-1" title="Issues Raised">
                    <span>🐛</span> {userMerits.issues}
                </div>
            )}
            {userMerits.prs > 0 && (
                <div className="badge badge-ghost gap-1" title="Pull Requests">
                    <span>🚀</span> {userMerits.prs}
                </div>
            )}
            {userMerits.comments > 0 && (
                <div className="badge badge-ghost justify-center gap-1" title="Comments">
                    <span>💬</span> {userMerits.comments}
                </div>
            )}
        </div>
    );
};
