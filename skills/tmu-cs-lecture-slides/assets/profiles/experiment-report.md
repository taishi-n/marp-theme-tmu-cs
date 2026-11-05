---
marp: true
theme: tmu-cs
paginate: true
math: mathjax
title: Synthetic gain comparison
sectionPages: false
sectionPageLevel: 2
citationDisplay: bibliography
footer: Arithmetic illustration
---

<!-- slide-id: gain-conditions -->
## Gain comparison

### Shared conditions

Input: $x=[0,1,0,-1]$; output: $y=gx$.

Compare $g=0.5$ and $g=1$ using the same four samples.

<!--
These values are an arithmetic illustration, not measured research results.
The comparison changes only the gain. No per-output normalization is applied.
-->

---

<!-- slide-id: gain-question -->
### Verification question

How does doubling the gain change the output's peak amplitude?

---

<!-- slide-id: gain-result -->
<!-- _class: tmu-cs-comparison -->
### Peak amplitude

<div class="tmu-cs-figure">

| Gain | Output | Peak absolute amplitude |
| --- | --- | ---: |
| 0.5 | [0, 0.5, 0, −0.5] | 0.5 |
| 1 | [0, 1, 0, −1] | 1 |

</div>

<div class="tmu-cs-takeaway">Doubling the gain doubles the peak amplitude in this example.</div>

---

<!-- paginate: skip -->
<!-- slide-id: gain-derivation -->
### Absolute amplitude

$$\max_n |g x_n| = |g|\max_n |x_n|.$$

<!-- This identity explains the displayed arithmetic; it is not a new experimental finding. -->
