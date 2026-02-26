"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "recent",     label: "Recent"     },
  { value: "likes_desc", label: "Most Liked" },
  { value: "likes_asc",  label: "Least Liked" },
];

export default function CaptionSort({ value }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (nextValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "recent") {
      params.delete("sort");
    } else {
      params.set("sort", nextValue);
    }
    params.set("page", "1");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  return (
    <div className="sort-pills" role="group" aria-label="Sort captions">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`sort-pill${value === opt.value ? " sort-pill--active" : ""}`}
          onClick={() => handleChange(opt.value)}
          aria-pressed={value === opt.value}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
