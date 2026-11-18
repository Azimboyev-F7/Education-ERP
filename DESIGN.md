# Design system

Mode: **Operate** (staff console). Calm, light, Apple-like. Tokens live in `apps/admin/app/globals.css`.

## Colour

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f5f5f7` | Page background |
| `surface` | `#ffffff` | Cards, tables, sidebar |
| `ink` | `#1d1d1f` | Primary text (16:1 on surface) |
| `ink-2` | `#424245` | Body text in tables |
| `ink-3` | `#6e6e73` | Secondary text, labels (5:1 on surface, 4.6:1 on canvas) |
| `line` | `#e5e5ea` | Hairline borders and dividers |
| `accent` | `#0a57d0` | Links, primary buttons, focus ring (6.7:1 on surface) |
| `ok` / `warn` / `bad` | text on tinted background | Status badges, always paired with a word |

One accent. Status colour is never the only signal.

## Type

Geist Sans. Scale: page title 28/34 semibold, section title 15 semibold, body 14/20, label 12 medium in `ink-3`. Tabular numerals on every figure. Headings balanced. No uppercase eyebrows.

## Shape and depth

Radius 12 for surfaces, 8 for controls. 1px hairline borders; a single soft shadow (`0 1px 2px rgb(0 0 0 / .04)`) on raised surfaces only. No nested cards.

## Layout

Fixed 232px sidebar (icons + labels), content max 1120px, 32px page padding (16px on small screens, sidebar becomes a top bar). Tables are hairline-ruled rows, not boxed cells; rows are links where they lead somewhere.

## Components

Page header (title, one-line description, actions) · data table · status badge · empty state (says why and what to do) · primary / secondary buttons · text field with label · inline error. Icons: one drawn set, 1.5px stroke, `aria-hidden`.

## Motion

Colour and background transitions at 120ms, listed explicitly, disabled under `prefers-reduced-motion`. No entrance animations.

## Focus and input

2px accent outline, 2px offset, on `:focus-visible`. Skip link to main content. Inputs carry `autocomplete`, labels, inline errors.
