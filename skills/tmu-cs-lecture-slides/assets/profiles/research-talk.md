---
marp: true
theme: tmu-cs
paginate: true
math: mathjax
title: Reading an IP datagram
sectionPages: false
sectionPageLevel: 2
bibliography: ref.bib
csl: compact.csl
citationDisplay: footnotes
footer: Network seminar
---

<!-- slide-id: packet-design -->
## Datagram design
<!-- section-page: true -->

### Header and payload

The header carries delivery information; the payload carries the content [@postel1981ip].

<!--
Explain the separation of delivery information from application content.
Field-level details belong in the appendix or the original specification.
-->

---

<!-- slide-id: packet-reading -->
### Reading the specification

Connect each field's definition to the sender's and receiver's processing.

---

<!-- paginate: skip -->
<!-- slide-id: packet-details -->
## Appendix

### Further reading

RFC 791 gives the complete field definitions [@postel1981ip].
