---
title: AND-LAB 기술 블로그를 시작합니다
description: 안드로이드 보안 연구실 AND-LAB이 연구 기록을 공개하는 이유와, 이 블로그에 어떤 글이 올라올지 정리했습니다.
category: lab
author: wtcy
tags: [공지, AND-LAB]
date: 2026-10-05 10:00:00 +0900
---

AND-LAB은 안드로이드를 뜯어보는 보안 연구실입니다. 앱 하나를 분석하다 보면 결국 프레임워크와 커널, 칩 펌웨어까지 내려가게 되는데, 그 과정에서 배운 것을 한곳에 모아 두려고 이 블로그를 열었습니다.

## 로고에 담은 뜻

연구실 로고는 안드로이드 잠금 화면의 3×3 패턴으로 그린 A입니다. 왼쪽 아래 점에서 출발해 꼭대기를 지나 오른쪽 아래로 내려간 뒤, 가운데 줄을 거꾸로 훑으면 A 모양이 됩니다.

<figure>
<svg viewBox="0 0 640 220" role="img" aria-label="3×3 패턴 점을 순서대로 이어 A를 그리는 과정">
<style>
.hl-dot{fill:var(--mark-dim)}.hl-on{fill:var(--accent)}
.hl-ln{fill:none;stroke:var(--accent);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.hl-t{font:500 13px var(--mono);fill:var(--ink-3)}.hl-n{font:600 11px var(--mono);fill:var(--accent-ink)}
.hl-ar{fill:none;stroke:var(--ink-3);stroke-width:1.5}
</style>
<g transform="translate(40,30)">
<g class="hl-dot"><circle cx="20" cy="20" r="6"/><circle cx="70" cy="20" r="6"/><circle cx="120" cy="20" r="6"/><circle cx="20" cy="70" r="6"/><circle cx="70" cy="70" r="6"/><circle cx="120" cy="70" r="6"/><circle cx="20" cy="120" r="6"/><circle cx="70" cy="120" r="6"/><circle cx="120" cy="120" r="6"/></g>
<circle class="hl-on" cx="20" cy="120" r="11"/><text class="hl-n" x="20" y="124" text-anchor="middle">1</text>
<text class="hl-t" x="70" y="165" text-anchor="middle">LOCKED</text>
</g>
<path class="hl-ar" d="M205 100h40m-8-6 8 6-8 6"/>
<g transform="translate(250,30)">
<g class="hl-dot"><circle cx="20" cy="20" r="6"/><circle cx="70" cy="20" r="6"/><circle cx="120" cy="20" r="6"/><circle cx="20" cy="70" r="6"/><circle cx="70" cy="70" r="6"/><circle cx="120" cy="70" r="6"/><circle cx="20" cy="120" r="6"/><circle cx="70" cy="120" r="6"/><circle cx="120" cy="120" r="6"/></g>
<polyline class="hl-ln" points="20,120 70,20 120,120"/>
<circle class="hl-on" cx="20" cy="120" r="11"/>
<text class="hl-t" x="70" y="165" text-anchor="middle">1 → 2 → 3</text>
</g>
<path class="hl-ar" d="M415 100h40m-8-6 8 6-8 6"/>
<g transform="translate(460,30)">
<g class="hl-dot"><circle cx="20" cy="20" r="6"/><circle cx="70" cy="20" r="6"/><circle cx="120" cy="20" r="6"/><circle cx="20" cy="70" r="6"/><circle cx="70" cy="70" r="6"/><circle cx="120" cy="70" r="6"/><circle cx="20" cy="120" r="6"/><circle cx="70" cy="120" r="6"/><circle cx="120" cy="120" r="6"/></g>
<polyline class="hl-ln" points="20,120 70,20 120,120 120,70 70,70 20,70"/>
<circle class="hl-on" cx="20" cy="120" r="11"/>
<text class="hl-t" x="70" y="165" text-anchor="middle" style="fill:var(--accent)">UNLOCKED</text>
</g>
</svg>
<figcaption>잠금 패턴을 끝까지 그리면 A가 되고, 잠금이 풀립니다.</figcaption>
</figure>

잠금을 푼다는 건 해킹 연구실이 하는 일과 닮았습니다. 정해진 순서와 규칙을 이해하고, 그 규칙이 어디서 허술한지 찾아내는 일이니까요.

## 무엇을 연구하나요

연구 분야는 여섯 갈래로 나눴습니다.

| 분야 | 주로 다루는 것 |
| --- | --- |
| 앱 해킹 | exported 컴포넌트, 딥링크, WebView |
| 리버싱·동적 분석 | jadx, smali, Frida 후킹 |
| 플랫폼·Binder | 시스템 서비스, AIDL, 권한 검사 |
| 네이티브·퍼징 | 파서·코덱 하네스, libFuzzer, ASan |
| 안드로이드 커널 | 드라이버 분석, syzkaller |
| 무선·하드웨어 | BLE, NFC, UART, 펌웨어 |

처음에는 의도적으로 취약하게 만든 실습 앱으로 감을 잡고, 익숙해지면 실제 앱과 오픈소스 컴포넌트로 넘어갑니다.

## 글은 이렇게 씁니다

블로그에 올리는 글은 몇 가지를 지키려고 합니다.

- 직접 돌려 본 명령과 결과만 씁니다. 해 보지 않은 건 해 보지 않았다고 적습니다.
- 명령어는 복사해서 바로 쓸 수 있게 코드 블록에 넣습니다.
- 막혔던 지점과 틀렸던 가설도 남깁니다. 다음 사람이 같은 데서 헤매지 않도록요.

> 이 블로그의 실습은 모두 자기 기기, 에뮬레이터, 의도적 취약 앱, 또는 허가받은 대상에서 진행합니다. 허가 없이 남의 서비스에 따라 하지 마세요.
{: .warn }

첫 기술 글로는 앱 해킹의 가장 기본인 exported 컴포넌트 이야기와, Frida로 루팅 탐지를 우회하는 실습을 올립니다.
