# Feature approach — 80/20 first, but only for the first time

Two different situations, two different priorities. Tell them apart before
deciding how to approach the work.

## Brand-new feature: propose the 80/20 slice, let the developer choose

When a feature doesn't exist yet, don't default to building the fully
robust version. Identify the ~20% of scope that delivers ~80% of the
value, and **present that as an explicit choice, not a silent decision**:
"here's the minimal version that ships the core value — here's what a
fuller version would additionally cover — which do you want?" Let the
developer pick. Don't build the maximal version on spec because it seemed
more thorough.

This is standard MVP thinking, not a shortcut invented for this repo: ship
the smallest version that tests the real hypothesis, iterate from actual
feedback rather than speculation
([Pareto framing applied to product development](https://www.molfar.io/blog/eighty-twenty-rule-mvp-development-focus)).
The formal backing is YAGNI — Ron Jeffries: "Always implement things when
you actually need them, never when you just foresee that you need them."
Martin Fowler's version: speculative/presumptive features cost build time
and carry ongoing weight even when never used
([Fowler on YAGNI](https://dzone.com/articles/martin-fowlerbliki-yagni-youre-not-gonna-need-it)).

**This is a known, specific failure mode for AI coding agents in
particular** — not just general advice. Anthropic's own release notes for
recent Claude models flag a tendency toward unrequested abstractions, extra
files, and premature backward-compatibility shims. The community-written
countermeasure that circulated widely is blunt: _"the simplest solution
that works is the correct solution"_ — an explicit no-over-engineering rule,
reported to meaningfully cut mistake rates
([writeups on countering agent over-engineering](https://codersera.com/blog/how-to-stop-claude-code-over-engineering-2026/)).
Constrain scope before generating code, not after — proposing the 80/20
slice up front _is_ that constraint.

YAGNI is not a license for sloppy code. Whichever slice gets picked still
needs to be correctly implemented, tested, and free of the shortcuts
`docs/rules/code-quality.md` rules out — skip a feature's edge cases
because you're not building them yet, don't skip the ones you did decide to
build.

## Adjusting an existing feature: 80/20 doesn't apply, edge cases do

Once a feature is live, the calculus flips. The value of the feature is
already proven; what matters now is not breaking it and not leaving new
gaps. Minimizing scope on a change to shipped functionality trades a
non-problem (needing to convince someone the feature is worth building) for
a real one (a regression, or an edge case that surfaces as a support
ticket or an incident). For adjustments:

- Prioritize test coverage and edge cases over keeping the diff small.
- Don't propose a "minimal version" of a bug fix or an adjustment the way
  you would a new feature — fix the actual problem, including the parts
  that are less common but still reachable.
- If the adjustment reveals the existing implementation was itself
  over-scoped or under-tested, that's worth flagging, but it's a separate
  conversation from the change at hand — don't silently expand scope to
  "fix everything nearby" either.
