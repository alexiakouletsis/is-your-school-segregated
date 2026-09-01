# Is Your School Segregated?

A scrollytelling data journalism piece examining course-sharing networks across grade levels at public school districts, illustrating patterns of educational tracking and segregation.

**Live site:** [isyourschoolsegregated.com](https://isyourschoolsegregated.com)

## About

Readers scroll through force-directed graph visualizations of real course-enrollment data (K–12), watching how students cluster by socioeconomic status or race depending on how tracked a school's course offerings are. A persistent toggle lets readers switch between viewing the data through an SES lens or a race lens at any point in the article.

Built in collaboration with Alvin Chang and the Plural Connections Group.

## Tech stack

- **React** + **TypeScript** + **Vite**
- **D3** for the force-directed graph simulations
- **Framer Motion** for scroll-linked animations and transitions
- **Tailwind v4**
- Custom design system using Kiwi Maru and Gaegu typefaces
- Deployed on **Vercel**

## Running locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints in your terminal.

To build for production:

```bash
npm run build
```

## Project structure

- `App.tsx` — top-level state, the persistent SES/Race toggle, and the nav bar
- `Hero.tsx` — the landing screen and intro animation
- `ArticleSection.tsx` — lays out the article's body sections in order
- `GraphSectionElementary.tsx`, `GraphSection68.tsx`, `GraphSection912.tsx` — the three scrollytelling graph sections (grades K–5, 6–8, 9–12)
- `Conclusion.tsx` — the closing section and its dot-based transition
- `graphUtils.ts` / `graphTypes.ts` — shared graph logic and types
- `useGraphSection.ts` — shared scroll/step-navigation logic for the graph sections
- `public/data/graphs/` — the per-grade course-sharing network data

## Data

Course-enrollment networks were converted from GML source data into JSON via `convert_gml_to_json.py`. `analyze_course_enrollments.py` and `compute_course_stats.py` were used during development to explore the data and validate the statistics referenced in the article text.
