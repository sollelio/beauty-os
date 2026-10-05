# 06 — Design Principles

**Canonical for:** product experience principles. All ten are `Decided`.

Apply to every journey ([04](04_CORE_USER_JOURNEYS.md)) and space ([05](05_PRODUCT_EXPERIENCE_MODEL.md)). These are product principles, not a visual design system.

---

| # | Principle | Means | Avoid |
|---|---|---|---|
| 1 | **Capture once** | Each business event is recorded once, when it happens, and everything else derives from it. | Re-entering the same data in several places; month-end reconstruction. |
| 2 | **Show consequences immediately** | At capture, show the effect (split, remaining balance, stock impact) **within the viewer's authorization boundary** ([05 §4](05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided)). Values not yet determinable are shown as pending, not as final ([05 §7](05_PRODUCT_EXPERIENCE_MODEL.md#7-remuneration-determinacy-in-the-experience--decided)). | Results visible only after the month is closed; exposing sensitive figures to whoever holds the device; provisional figures presented as final. |
| 3 | **Exceptions over exhaustive inspection** | Surface what needs attention; let the rest be trusted. | Forcing review of every line to find a problem. |
| 4 | **Explain the numbers** | Every important financial number can answer "Where did this number come from?" | Opaque totals. |
| 5 | **Mobile-first** | One responsive web app designed for a smartphone first; tablet and desktop adapt layout and density ([05 §2](05_PRODUCT_EXPERIENCE_MODEL.md#2-device-constraints-and-form-factor)). | Desktop layouts squeezed onto a phone; mobile UI merely stretched to desktop. |
| 6 | **Shared-device friendly** | Fast operator switching; privacy between professionals; extra confirmation only for sensitive actions. | Full login/logout for ordinary actions; exposing others' finances. |
| 7 | **Human judgement remains where the rule is contextual** | Where the business decides case by case (contextual rates, owner distributions, advances above earnings), the product informs and warns; people decide. | Inventing blocking rules or automating decisions that are not validated. |
| 8 | **Complexity belongs underneath the interface** | Rules, splits and contributions are handled by the product; daily screens stay simple. | Exposing configuration complexity in daily flows. |
| 9 | **Fast, low-friction daily operation** | Common actions take seconds, between customers, with minimal required fields (e.g. customer optional). | Mandatory fields that do not serve a validated need. |
| 10 | **Do not turn the product into a heavy ERP** | Operational financial visibility for a small team. | Accounting structures, formal payroll, warehouse inventory (see [03 §4](03_V1_SCOPE.md#4-explicitly-not-v1--decided)). |

## Resolved tensions — `Decided`

- **2 vs 6** (immediate consequences vs shared-device privacy): consequences are shown only within the viewer's authorization boundary. See [05 §4](05_PRODUCT_EXPERIENCE_MODEL.md#4-shared-device-privacy--decided).
- **2 vs 7** (immediate split vs contextual rate): contextual remuneration is shown as pending determination, never as a final provisional value. See [03 §3](03_V1_SCOPE.md#determinate-vs-contextual--pending-remuneration--decided).
