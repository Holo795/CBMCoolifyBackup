import type { SVGProps } from "react";

/** GitLab mark (simplified, monochrome), for the OAuth button. */
export function GitlabIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <path d="M12 22.6 1.3 14.9a.9.9 0 0 1-.33-1L4.1 2.6a.5.5 0 0 1 .95 0l2.3 7.1h9.3l2.3-7.1a.5.5 0 0 1 .95 0l3.13 11.3a.9.9 0 0 1-.33 1L12 22.6Z" />
    </svg>
  );
}
