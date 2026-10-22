---
title: Scudo를 역이용해 임의 쓰기 만들기
description: Android 11부터 기본 힙 할당기가 된 Scudo가 무엇을 지키는지 실습 앱으로 확인하고, WOOT'24 베스트 페이퍼가 Zygote 구조를 파고들어 두 가지 임의 쓰기 기법을 세운 과정을 따라갑니다.
category: platform
author: seika
tags: [Scudo, Heap, Zygote, Binder, Android]
date: 2026-10-21 10:00:00 +0900
---

안녕하세요, SeiKa입니다. 요즘 안드로이드 네이티브 힙을 파고들고 있는데, 바닥에 깔린 할당기부터 손에 익혀야 그 위에서 터지는 버그가 왜 위험한지 눈에 들어오더라고요. 그러다 만난 게 오늘 같이 풀어 볼 논문입니다.

메모리 손상 버그는 열에 아홉 힙에서 터집니다. 뒤집어 말하면 할당기를 단단하게 조여 둘수록 익스플로잇은 그만큼 고단해지죠. 구글이 Android 11에서 네이티브 코드의 기본 할당기를 jemalloc에서 [Scudo](https://llvm.org/docs/ScudoHardenedAllocator.html)로 갈아 끼운 것도 그 계산이었고요. 벤더가 따로 손대지 않은 한, 앱이든 시스템 서비스든 바닥에서는 죄다 Scudo 위에서 돕니다.

이 글이 따라가는 건 EPFL의 Philipp Mao 등이 쓴 [Exploiting Android's Hardened Memory Allocator](https://www.usenix.org/conference/woot24/presentation/mao)(USENIX WOOT 2024, 베스트 페이퍼)입니다. 논문의 짜임은 이렇습니다. Scudo가 무엇을 어떻게 지키는지 먼저 펼쳐 놓고 Android의 userspace 구조 때문에 그 방어의 절반이 사실상 무력해진다는 점을 짚은 뒤, 남은 틈으로 임의 메모리 쓰기까지 가는 기법 두 개를 세웁니다. 이 글도 같은 순서를 밟을게요. Scudo의 방어를 실습 앱으로 하나씩 눈으로 확인하고, 그다음 논문이 벽을 하나하나 넘는 길을 따라가 보죠. 측정은 모두 x86_64 이미지의 Android 13 에뮬레이터(API 33)에서 돌렸습니다. 자, 그럼 시작해 볼까요?

## Scudo가 세운 네 개의 벽

Scudo는 glibc 할당기와 똑같은 API(`malloc`, `free`)를 그대로 내주는 드롭인 교체품입니다. 겉모습은 똑같고, 다른 건 그 안쪽이죠. 방어를 네 겹 깔아 두는데 논문은 이를 격리(Isolate)·무작위화(Randomize)·보호(Protect)·분리(Separate)로 갈라 설명합니다. 하나씩 뜯어 볼게요.

격리부터 보죠. Scudo는 요청 크기를 보고 청크를 primary와 secondary로 가릅니다. primary는 크기 구간별로 미리 떼어 둔 영역(class ID)에 들어가고 secondary는 자기만의 매핑을 따로 받습니다. 가령 0x18을 달라고 하면 class ID 2 영역에서 하나 떨어지는 식입니다. 영역과 영역 사이, 그리고 free 리스트처럼 할당기가 쓰는 내부 메타데이터 둘레에는 접근 권한이 없는 guard page가 둘러쳐집니다. 덕분에 class 2 영역에서 오버플로가 나더라도 그 영역 안에서만 넘칠 뿐 다른 크기의 청크나 메타데이터로 곧장 번지지는 못합니다.

<figure>
<svg viewBox="0 0 680 300" role="img" aria-label="Scudo 메모리 맵. 크기별 class 영역과 secondary 영역이 각각 guard page 로 둘러싸여 있고, 할당기 메타데이터는 따로 떨어진 영역에 있다">
<style>
.sc-reg{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.sc-chunk{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.sc-meta{fill:var(--bg-3);stroke:var(--ink-3);stroke-width:1.5}
.sc-guard{fill:none;stroke:var(--ink-3);stroke-width:1.5;stroke-dasharray:4 4}
.sc-t{font:600 13px var(--sans);fill:var(--ink)}
.sc-s{font:500 11px var(--mono);fill:var(--ink-3)}
.sc-a{font:600 11px var(--mono);fill:var(--accent)}
</style>
<rect class="sc-guard" x="30" y="30" width="300" height="34" rx="6"/>
<text class="sc-s" x="180" y="52" text-anchor="middle">guard page</text>
<rect class="sc-reg" x="30" y="74" width="300" height="48" rx="6"/>
<rect class="sc-chunk" x="42" y="86" width="60" height="24" rx="4"/>
<rect class="sc-chunk" x="110" y="86" width="60" height="24" rx="4"/>
<text class="sc-t" x="300" y="103" text-anchor="end">Class 1 영역</text>
<rect class="sc-guard" x="30" y="128" width="300" height="34" rx="6"/>
<text class="sc-s" x="180" y="150" text-anchor="middle">guard page</text>
<rect class="sc-reg" x="30" y="172" width="300" height="48" rx="6"/>
<rect class="sc-chunk" x="42" y="184" width="60" height="24" rx="4"/>
<text class="sc-a" x="72" y="201" text-anchor="middle">0x18</text>
<rect class="sc-chunk" x="110" y="184" width="60" height="24" rx="4"/>
<text class="sc-t" x="300" y="201" text-anchor="end">Class 2 영역</text>
<rect class="sc-guard" x="30" y="226" width="300" height="34" rx="6"/>
<text class="sc-s" x="180" y="248" text-anchor="middle">guard page</text>
<rect class="sc-guard" x="370" y="30" width="280" height="34" rx="6"/>
<text class="sc-s" x="510" y="52" text-anchor="middle">guard page</text>
<rect class="sc-meta" x="370" y="74" width="280" height="48" rx="6"/>
<text class="sc-t" x="510" y="103" text-anchor="middle">free 리스트 · 메타데이터</text>
<rect class="sc-guard" x="370" y="128" width="280" height="34" rx="6"/>
<text class="sc-s" x="510" y="150" text-anchor="middle">guard page</text>
<rect class="sc-reg" x="370" y="172" width="280" height="88" rx="6"/>
<rect class="sc-chunk" x="384" y="200" width="252" height="34" rx="4"/>
<text class="sc-t" x="510" y="222" text-anchor="middle">secondary 청크 (자기 매핑)</text>
<text class="sc-s" x="510" y="283" text-anchor="middle">크기마다 영역이 다르고, 메타데이터는 청크와 떨어져 있다</text>
</svg>
<figcaption>Scudo의 메모리 배치. 크기별 class 영역과 secondary 영역이 각각 guard page로 둘러싸이고, 할당기 메타데이터는 청크와 다른 곳에 산다.</figcaption>
</figure>

무작위화는 heap feng shui를 겨냥합니다. 영역을 처음 매핑할 때 Scudo는 청크가 들어갈 주소 여러 개를 TransferBatch에 모아 두고 그 순서를 할당기에 저장된 시드로 섞어 버립니다. 그래서 연달아 할당해도 주소가 이어지지 않고 실행마다 위치가 바뀝니다. 실습 앱에서 0x18 청크를 다섯 번 할당하는 걸 두 번 돌려 보면 바로 눈에 들어옵니다.

![Scudo Randomize 실측. 0x18 청크를 다섯 번 할당해 두 번 실행한 터미널. alloc[0]~alloc[4] 주소가 연속이 아니고, run 1 과 run 2 사이에 상위 주소가 통째로 바뀌었다.]({{ '/assets/img/posts/scudo-allocator/01-randomize.png' | relative_url }})

보호는 청크 헤더를 지키는 장치입니다. 할당을 마치면 Scudo는 반환 포인터에서 0x10만큼 앞에 헤더를 심어 둡니다. 여기에 담기는 건 class ID, 상태(State — 사용 중인지 free됐는지), 그리고 체크섬입니다. 체크섬은 청크 주소와 헤더 내용에 프로그램이 뜰 때 정해지는 16비트 쿠키까지 넣고 CRC32로 버무려 만듭니다. 청크를 만질 때마다 Scudo가 이 값을 다시 계산해 맞춰 보기 때문에 헤더를 함부로 덮으면 곧바로 걸립니다.

```c
short checksum(long address, long header, int cookie) {
    int x = CRC32(cookie, address);
    x = CRC32(x, header);
    return (short)((x & (x >> 16)) & 0xffff);
}
```

보호가 실제로 어떻게 발동하는지 두 가지 경우로 찍어 봤습니다. 하나는 이미 free한 청크를 한 번 더 free하는 경우. 상태 필드가 벌써 free로 적혀 있으니 Scudo가 두 번째 free를 그냥 멈춰 세웁니다.

![이중 free 실측. 같은 0x18 청크를 두 번 free 하자 Scudo ERROR: invalid chunk state 가 찍히고 exit=134(SIGABRT)로 죽는다.]({{ '/assets/img/posts/scudo-allocator/03-double-free-abort.png' | relative_url }})

다른 하나는 헤더를 직접 흔드는 경우입니다. 청크 자기 헤더(반환 주소 - 0x10)의 첫 바이트를 뒤집고 free하면 저장돼 있던 체크섬이 바뀐 헤더와 더는 맞아떨어지지 않아 abort로 이어집니다. 뒤집기 직전 그 첫 바이트를 찍어 보면 0x02가 나오는데 이게 바로 0x18 청크의 class ID 2입니다.

![헤더 손상 실측. 청크 헤더 첫 바이트(0x02 = class ID 2)를 뒤집고 free 하자 Scudo ERROR: corrupted chunk header 로 abort 한다.]({{ '/assets/img/posts/scudo-allocator/04-header-checksum-abort.png' | relative_url }})

마지막 벽인 분리는 인라인 포인터를 노립니다. secondary 청크는 primary와 같은 모양의 헤더를 쓰되 class ID만 0으로 두고 그 앞(반환 주소 - 0x40)에 확장 헤더를 하나 더 붙입니다. 확장 헤더에는 free 리스트를 잇는 Prev·Next 포인터와 매핑의 시작 주소·크기(CommitBase, CommitSize, MapBase, MapSize)가 들어갑니다. 눈여겨볼 대목은 이 확장 헤더에 체크섬이 없다는 것입니다. Scudo는 매핑 하나에 secondary 청크가 오직 하나뿐이고 그 둘레를 guard page가 막아 준다는 사실 하나만 믿습니다. 바꿔 말하면, 인라인 포인터는 다른 청크들과 완전히 떨어진 별도 매핑 안에만 존재하는 셈이죠. 뒤에서 공격이 노리는 게 바로 이 가정입니다.

## Zygote가 벽 두 개를 먼저 허문다

무작위화와 보호는 둘 다 비밀 하나에 전적으로 기댑니다. 무작위화는 TransferBatch의 내용과 시드가 공격자에게 새지 않아야 성립하고 보호는 쿠키를 모르면 유효한 체크섬을 못 만든다는 가정 위에 서 있습니다. 문제는 Android의 userspace 구조가 이 비밀을 공짜로 떠넘긴다는 데 있어요. 어쩌다 그렇게 됐을까요?

Android에서 앱과 상당수 시스템 서비스는 하나같이 같은 [Zygote](https://developer.android.com/topic/performance/memory-overview) 프로세스에서 fork됩니다. 프레임워크 코드와 리소스를 메모리에서 나눠 써 기동을 앞당기려는 설계죠. 그런데 Zygote는 fork에 앞서 이미 Scudo를 깨워 쿠키와 TransferBatch 시드를 못 박아 둡니다. fork는 그 상태를 그대로 베껴 가므로 Zygote에서 갈라진 프로세스들은 ASLR 레이아웃도 할당기의 비밀도 똑같은 상태로 시작합니다.

<figure>
<svg viewBox="0 0 680 250" role="img" aria-label="Zygote 가 쿠키와 시드를 정한 뒤 fork 되어, 악성 앱과 시스템 서버가 같은 쿠키와 레이아웃을 공유한다">
<style>
.zy-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.zy-bad{fill:var(--bg-2);stroke:var(--red);stroke-width:1.5}
.zy-seed{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.zy-t{font:600 13px var(--sans);fill:var(--ink)}
.zy-s{font:500 11px var(--mono);fill:var(--ink-3)}
.zy-a{font:600 11px var(--mono);fill:var(--accent)}
.zy-r{font:600 11px var(--mono);fill:var(--red)}
.zy-ln{fill:none;stroke:var(--ink-3);stroke-width:1.5}
.zy-h{fill:var(--ink-3)}
</style>
<rect class="zy-box" x="250" y="20" width="180" height="70" rx="10"/>
<text class="zy-t" x="340" y="46" text-anchor="middle">Zygote</text>
<rect class="zy-seed" x="266" y="56" width="148" height="24" rx="5"/>
<text class="zy-a" x="340" y="73" text-anchor="middle">cookie · seed 확정</text>
<path class="zy-ln" d="M300 90v30q0 15-15 15H165q-15 0-15 15v18"/><path class="zy-h" d="m144 177 6 10 6-10z"/>
<path class="zy-ln" d="M380 90v30q0 15 15 15h120q15 0 15 15v18"/><path class="zy-h" d="m524 177 6 10 6-10z"/>
<text class="zy-s" x="340" y="128" text-anchor="middle">fork — 상태를 그대로 복제</text>
<rect class="zy-bad" x="60" y="180" width="180" height="60" rx="10"/>
<text class="zy-t" x="150" y="205" text-anchor="middle">악성 앱</text>
<text class="zy-r" x="150" y="225" text-anchor="middle">같은 cookie · 레이아웃</text>
<rect class="zy-box" x="440" y="180" width="180" height="60" rx="10"/>
<text class="zy-t" x="530" y="205" text-anchor="middle">system_server</text>
<text class="zy-a" x="530" y="225" text-anchor="middle">같은 cookie · 레이아웃</text>
</svg>
<figcaption>Zygote가 쿠키와 시드를 정한 뒤에 fork하므로, 거기서 갈라진 악성 앱과 시스템 서버는 같은 비밀과 같은 주소 배치를 들고 출발한다.</figcaption>
</figure>

이게 무슨 소린지는 fork를 직접 돌려 보면 또렷해집니다. 할당기를 한 번 깨운 뒤 `fork()`하고 부모와 자식이 각자 `malloc`을 부르면 둘이 같은 주소를 받습니다. 자식은 Zygote에서 갈라진 또 다른 프로세스나 마찬가지이고 그 프로세스가 어디에 할당할지를 부모가 이미 꿰고 있다는 얘기죠. 실행을 새로 하면 ASLR 때문에 주소야 달라지지만 한 번의 fork 안에서는 변함없이 같습니다.

![fork 공유 상태 실측. 할당기를 깨운 뒤 fork 한 부모와 자식이 한 실행 안에서는 같은 malloc 주소를 받고(run 1, run 2 각각), 실행이 바뀌면 상위 주소가 함께 바뀐다.]({{ '/assets/img/posts/scudo-allocator/02-fork-shared-state.png' | relative_url }})

그러니 악성 앱이 피해자 프로세스를 노리는 상황에서는 무작위화와 보호가 그대로 무력해집니다. 악성 앱은 자기 할당기를 오라클처럼 굴려 피해자 청크가 어디에 떨어질지 미리 점칩니다. 자기 메모리에 박힌 쿠키를 그대로 읽어 어떤 헤더에든 통과하는 체크섬을 붙여 줍니다. 논문은 이 두 방어가 이미 뚫린 상태에서 나머지 이야기를 풀어 갑니다.

## 남은 두 벽을 넘어 임의 쓰기로

힙 익스플로잇이 바라는 건 결국 할당기를 꾀어내 공격자가 찍은 주소에 청크를 앉히는 것입니다. 그렇게 쓸 수 있는 메모리가 손에 들어오면 이를테면 스택에 청크를 잡아 ROP 체인을 써 넣는 식으로 코드 실행까지 뻗어 나갑니다. 무작위화와 보호는 이미 깨졌으니 남은 건 격리와 분리, 두 벽뿐입니다.

여기서부터는 공격자가 피해자 청크의 헤더를 건드릴 수 있는 메모리 손상 수단 하나를 손에 쥐었다고 칩니다. 뒤 청크 헤더까지 넘쳐 흐르는 힙 오버플로가 전형적인 예죠. 보호가 깨진 터라 공격자는 헤더 필드를 마음대로 고치고 거기에 맞는 체크섬을 얹을 수 있습니다. 이때 던지는 한 수가 class ID를 0으로 바꾸는 것입니다. primary 청크의 class ID가 0이 되면 Scudo는 그 청크를 secondary로 보고 확장 secondary 헤더를 청크 위치에서 곧이곧대로 읽어 들입니다. 체크섬 없는 그 확장 헤더가 이제 공격자 손안에 인라인으로 떨어진 것이고 분리가 기대고 있던 전제가 여기서 깨집니다.

<figure>
<svg viewBox="0 0 680 230" role="img" aria-label="primary 청크의 class ID 를 2에서 0으로 바꾸면 그 위치가 공격자가 채운 가짜 secondary 헤더로 바뀐다">
<style>
.ov-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.ov-good{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.ov-bad{fill:color-mix(in srgb, var(--red) 12%, transparent);stroke:var(--red);stroke-width:1.5}
.ov-t{font:600 13px var(--sans);fill:var(--ink)}
.ov-s{font:500 11px var(--mono);fill:var(--ink-3)}
.ov-a{font:600 11px var(--mono);fill:var(--accent)}
.ov-r{font:600 11px var(--mono);fill:var(--red)}
.ov-ar{fill:none;stroke:var(--ink-3);stroke-width:2}
.ov-h{fill:var(--ink-3)}
</style>
<text class="ov-s" x="150" y="28" text-anchor="middle">오버플로 전</text>
<rect class="ov-good" x="40" y="40" width="220" height="150" rx="8"/>
<text class="ov-t" x="150" y="70" text-anchor="middle">primary 청크</text>
<rect class="ov-box" x="60" y="86" width="180" height="30" rx="5"/>
<text class="ov-a" x="150" y="106" text-anchor="middle">ClassId: 2 · State: 할당</text>
<rect class="ov-box" x="60" y="124" width="180" height="50" rx="5"/>
<text class="ov-s" x="150" y="153" text-anchor="middle">보통의 데이터</text>
<path class="ov-ar" d="M280 115h120"/><path class="ov-h" d="m396 109 10 6-10 6z"/>
<text class="ov-s" x="340" y="104" text-anchor="middle">헤더 덮어쓰기</text>
<text class="ov-s" x="530" y="28" text-anchor="middle">오버플로 후</text>
<rect class="ov-bad" x="420" y="40" width="220" height="150" rx="8"/>
<text class="ov-t" x="530" y="70" text-anchor="middle">가짜 secondary 청크</text>
<rect class="ov-box" x="440" y="86" width="180" height="30" rx="5"/>
<text class="ov-r" x="530" y="106" text-anchor="middle">ClassId: 0 · State: 할당</text>
<rect class="ov-box" x="440" y="124" width="180" height="50" rx="5"/>
<text class="ov-r" x="530" y="146" text-anchor="middle">Prev · Next · CommitBase</text>
<text class="ov-r" x="530" y="164" text-anchor="middle">…공격자가 채운 확장 헤더</text>
</svg>
<figcaption>class ID를 2에서 0으로 바꾸면, 그 위치의 데이터가 공격자가 통째로 채운 가짜 secondary 확장 헤더로 해석된다. 분리의 전제가 여기서 깨진다.</figcaption>
</figure>

가짜 secondary 헤더를 손에 쥐고 나면 이걸 어떻게 주무르느냐에서 길이 둘로 갈라집니다. 논문이 세운 두 기법이 각각 그 두 갈래죠. 하나씩 따라가 볼까요?

### 기법 1 — Forged CommitBase

secondary 헤더의 CommitBase는 그 청크(확장 헤더까지 포함)가 시작하는 주소를 가리킵니다. secondary 청크를 free하면 이 CommitBase가 secondary free 리스트에 올라갑니다. 훗날 그 영역을 할당 요청에 내줄 때 Scudo는 free 리스트에 적힌 CommitBase를 근거로 청크 위치를 잡습니다.

그렇다면 가짜 헤더의 CommitBase에 노리는 목표 주소를 적어 두기만 하면 Scudo가 그 주소에 secondary 청크를 앉혀 줍니다. free가 통과하려면 Prev·Next가 멀쩡해야 하는데 Scudo는 이 포인터들이 널인지부터 봅니다. 널이면 언링크를 아예 건너뛰므로 둘 다 0으로 채우면 그만입니다. 가짜 청크를 free하면 목표 주소가 free 리스트에 실리고 이어서 secondary 할당을 부르면 그 주소에 청크가 떨어집니다. 목표를 스택 주소로 잡아 두면 스택 한복판에 청크가 생기는 거죠.

<figure>
<svg viewBox="0 0 680 250" role="img" aria-label="가짜 secondary 헤더의 CommitBase 를 스택 주소로 적고 free 하면 그 주소가 free 리스트에 실리고, 다음 할당이 스택에 잡힌다">
<style>
.fc-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.fc-bad{fill:color-mix(in srgb, var(--red) 12%, transparent);stroke:var(--red);stroke-width:1.5}
.fc-stk{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.fc-t{font:600 12.5px var(--sans);fill:var(--ink)}
.fc-s{font:500 10.5px var(--mono);fill:var(--ink-3)}
.fc-a{font:600 10.5px var(--mono);fill:var(--accent)}
.fc-r{font:600 10.5px var(--mono);fill:var(--red)}
.fc-n{font:700 11px var(--mono);fill:var(--accent-ink)}
.fc-ar{fill:none;stroke:var(--ink-3);stroke-width:2}
.fc-h{fill:var(--ink-3)}
.fc-dot{fill:var(--accent)}
</style>
<rect class="fc-bad" x="30" y="40" width="200" height="150" rx="8"/>
<text class="fc-t" x="130" y="34" text-anchor="middle" fill="var(--ink-3)">① 가짜 헤더를 적는다</text>
<rect class="fc-box" x="46" y="56" width="168" height="24" rx="4"/><text class="fc-s" x="52" y="73">Prev: 0  Next: 0</text>
<rect class="fc-box" x="46" y="86" width="168" height="24" rx="4"/><text class="fc-r" x="52" y="103">CommitBase: 스택주소</text>
<rect class="fc-box" x="46" y="116" width="168" height="24" rx="4"/><text class="fc-s" x="52" y="133">CommitSize: 0x20000</text>
<rect class="fc-box" x="46" y="146" width="168" height="30" rx="4"/><text class="fc-r" x="52" y="165">ClassId: 0 (secondary)</text>
<circle class="fc-dot" cx="300" cy="90" r="9"/><text class="fc-n" x="300" y="94" text-anchor="middle">2</text>
<text class="fc-s" x="300" y="118" text-anchor="middle">free →</text>
<rect class="fc-box" x="340" y="66" width="160" height="70" rx="8"/>
<text class="fc-t" x="420" y="90" text-anchor="middle">secondary free 리스트</text>
<text class="fc-a" x="420" y="114" text-anchor="middle">[ 스택주소 ]</text>
<circle class="fc-dot" cx="560" cy="90" r="9"/><text class="fc-n" x="560" y="94" text-anchor="middle">3</text>
<text class="fc-s" x="560" y="118" text-anchor="middle">할당 요청</text>
<rect class="fc-stk" x="470" y="160" width="180" height="60" rx="8"/>
<text class="fc-t" x="560" y="185" text-anchor="middle">스택에 잡힌 청크</text>
<text class="fc-a" x="560" y="205" text-anchor="middle">여기에 ROP 체인을 쓴다</text>
<path class="fc-ar" d="M560 136v14"/><path class="fc-h" d="m554 150 6 10 6-10z"/>
</svg>
<figcaption>CommitBase를 스택 주소로 적어 두고 free하면 그 주소가 secondary free 리스트에 실린다. 다음 secondary 할당은 그대로 스택에 청크를 잡는다.</figcaption>
</figure>

조건이 하나 붙습니다. free하는 순간 secondary 청크가 최소 하나는 살아 할당돼 있어야 합니다. 그러지 않으면 사용 중 secondary 개수 카운터가 -1로 뒤집히면서 다음 secondary 할당 때 Scudo가 오작동하거든요. 아무튼 이게 격리를 넘는 첫 번째 길입니다.

### 기법 2 — Safe Unlink

두 번째는 secondary 청크를 free할 때 벌어지는 언링크를 노립니다. glibc의 unsafe unlink가 연결 리스트 언링크를 비틀어 임의 쓰기를 뽑아내던 것과 거의 판박이 발상인데 Scudo도 요즘 glibc처럼 연결 리스트의 무결성을 깐깐하게 따집니다. 그래서 공격자는 멀쩡해 보이는 가짜 연결 리스트를 두 항목으로 지어야 합니다. 한 항목은 가짜 secondary 헤더 자신이고 나머지 한 항목은 PerClass 구조 속에 심습니다.

PerClass는 특정 class ID의 free 청크 포인터들을 쟁여 두는 리스트입니다. 개수(Count), 최대치(MaxCount), 그리고 청크 헤더 주소들을 늘어놓은 배열(Chunks)로 짜여 있습니다.

```c
struct PerClass {
    short Count;
    short MaxCount;
    void *Chunks[MaxCount];
};
```

요령은 가짜 secondary 헤더와 겹치도록 primary 청크 헤더를 적어 두고 그걸 free하는 것입니다. 그러면 가짜 secondary 헤더의 주소가 PerClass 안으로 들어갑니다. 같은 수를 한 번 더 써서 그 주소를 PerClass에 잇따라 두 번 심고 끝으로 가짜 secondary 헤더의 Prev·Next가 PerClass 안의 그 위치를 가리키도록 맞춰 둡니다. 이렇게 두 항목짜리 가짜 연결 리스트가 완성됩니다. 무작위화와 보호가 이미 깨진 덕에 공격자는 PerClass가 어디 있는지도 알고 있고요. 이제 secondary 청크를 free하면 언링크가 돌면서 free 리스트를 가리키는 주소가 free 리스트 자신에 박힙니다. 그 영역을 다시 할당받으면 PerClass와 겹치는 청크가 손에 들어옵니다. 공격자가 free 리스트에 원하는 주소를 제 손으로 적어 넣을 수 있게 된 것이니 격리도 뚫린 셈입니다. 두 기법 모두 피해자 청크의 정확한 주소를 알아야 한다는 단서가 붙지만 그 몫은 앞서 본 Zygote가 메워 줍니다.

## 사례 연구 — system_server 치기

두 기법이 종이 위 이야기로 끝나지 않는다는 걸 보이려고 논문은 오래된 취약점 [CVE-2015-1528](https://nvd.nist.gov/vuln/detail/CVE-2015-1528)을 Android 14에 되살려 system_server를 칩니다. 이 취약점은 Binder 데이터를 역직렬화하는 `native_handle_create`에서 인자 검사가 빠져 터지는 힙 언더/오버플로입니다. `numFds`와 `numInts`는 둘 다 공격자가 보낸 Binder 데이터에서 그대로 읽히는 값인데 검사를 들어내면 여기에 음수를 꽂아 할당된 청크 바깥을 읽고 쓰게 몰아갈 수 있습니다.

```c
native_handle_t *native_handle_create(int numFds, int numInts) {
    // 원래 있던 검사(numFds<0 || numInts<0 || 상한)를 빼면 취약해진다
    native_handle_t *h = malloc(sizeof(native_handle_t) + sizeof(int) * (numFds + numInts));
    if (h) {
        h->version = sizeof(native_handle_t);
        h->numFds = numFds;
        h->numInts = numInts;
    }
    return h;
}
```

system_server는 탐나는 표적입니다. Zygote에서 맨 먼저 fork되는 프로세스라 앞서 본 두 벽이 애초에 없습니다. 그 안에서 수십 개 서비스가 Binder로 일반 앱에 열려 있으며 system 사용자로 도니 루트가 코앞입니다. 거기에 크래시가 나도 다시 살아나니 공격자는 몇 번이고 다시 시도할 수 있고요. 논문은 그 가운데 SensorService를 고릅니다. `CREATE_SENSOR_DIRECT_CONNECTION` 코드로 Binder 요청을 날리면 취약한 `readNativeHandle`이 불립니다. 그 안에서 원하는 크기의 청크를 할당하고 거기서 출발하는 언더/오버플로를 일으킨 뒤 곧바로 그 청크를 free하는 흐름이 Binder 한 번에 통째로 딸려 나옵니다.

<figure>
<svg viewBox="0 0 680 220" role="img" aria-label="악성 앱이 두 번의 Binder 요청으로 SensorService 를 거쳐 system_server 스택에 ROP 체인을 올리는 흐름">
<style>
.cs-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.cs-bad{fill:var(--bg-2);stroke:var(--red);stroke-width:1.5}
.cs-stk{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5}
.cs-t{font:600 12.5px var(--sans);fill:var(--ink)}
.cs-s{font:500 10.5px var(--mono);fill:var(--ink-3)}
.cs-a{font:600 10.5px var(--mono);fill:var(--accent)}
.cs-r{font:600 10.5px var(--mono);fill:var(--red)}
.cs-ln{fill:none;stroke:var(--ink-3);stroke-width:2}
.cs-h{fill:var(--ink-3)}
</style>
<rect class="cs-bad" x="30" y="80" width="150" height="60" rx="10"/>
<text class="cs-t" x="105" y="106" text-anchor="middle">악성 앱</text>
<text class="cs-r" x="105" y="126" text-anchor="middle">unprivileged</text>
<rect class="cs-box" x="270" y="30" width="170" height="160" rx="10"/>
<text class="cs-s" x="355" y="52" text-anchor="middle">system_server</text>
<rect class="cs-box" x="286" y="64" width="138" height="52" rx="8"/>
<text class="cs-t" x="355" y="86" text-anchor="middle">SensorService</text>
<text class="cs-s" x="355" y="104" text-anchor="middle">readNativeHandle</text>
<rect class="cs-stk" x="286" y="124" width="138" height="52" rx="8"/>
<text class="cs-t" x="355" y="146" text-anchor="middle">메인 스레드 스택</text>
<text class="cs-a" x="355" y="164" text-anchor="middle">pollOnce 반환주소</text>
<path class="cs-ln" d="M180 100h80"/><path class="cs-h" d="m256 94 10 6-10 6z"/>
<text class="cs-s" x="222" y="88" text-anchor="middle">① Binder</text>
<text class="cs-s" x="222" y="126" text-anchor="middle">가짜 secondary</text>
<path class="cs-ln" d="M180 120h80"/><path class="cs-h" d="m256 170 10 6-10 6z" opacity="0"/>
<text class="cs-r" x="540" y="86" text-anchor="middle">② Binder</text>
<text class="cs-r" x="540" y="104" text-anchor="middle">ROP 체인 쓰기</text>
<path class="cs-ln" d="M440 150h100q20 0 20-20v-6"/><path class="cs-h" d="m554 126 6-10 6 10z"/>
<rect class="cs-box" x="470" y="150" width="180" height="46" rx="8"/>
<text class="cs-a" x="560" y="178" text-anchor="middle">logcat: H3Ll0 ...</text>
</svg>
<figcaption>첫 Binder 요청은 언더플로로 스택 주소를 secondary free 리스트에 심고, 둘째 요청은 그 위치에 0x20000 청크를 할당해 스택에 ROP 체인을 쓴다.</figcaption>
</figure>

실제 공격은 Binder 요청 두 방으로 끝납니다. 첫 방은 앞서 본 Forged CommitBase 그대로입니다. `numFds`에 음수(-23)를 실어 언더플로의 출발점을 할당된 청크 헤더 바로 앞, 정확히는 가짜 secondary 헤더의 맨 앞까지 당겨 놓습니다. 뒤따르는 데이터로 가짜 확장 헤더를 통째로 채워 넣습니다. Prev·Next는 0, CommitBase는 메인 스레드 스택의 목표 주소, CommitSize는 0x20000으로 맞춥니다. class ID 0짜리 헤더(FakeHeader)를 제대로 만들려면 청크 주소와 쿠키가 있어야 하는데 쿠키는 자기 앱 메모리에서 곧장 읽어 옵니다. 다만 system_server는 마흔 개가 넘는 스레드가 Binder 요청을 받아 내는 통에 청크 주소를 정확히 짚기가 만만치 않아서 가장 큰 primary class를 동원해도 열에 한 번꼴로만 맞았다고 합니다.

둘째 방은 그 스택 위치에 0x20000 크기의 `native_handle`을 할당하게 만들어 `readNativeHandle`이 저장돼 있던 `pollOnce` 반환 주소부터 ROP 체인을 써 내려가게 합니다. 여기엔 얄궂은 경주가 하나 숨어 있습니다. 체인을 다 적고 나면 메인 스레드가 `pollOnce`에서 돌아오는 쪽과 SensorService가 `native_handle_close_with_tag`를 부르는 쪽이 맞붙습니다. 뒤쪽이 이기면 중복된 정수를 파일 디스크립터라고 닫으려다 [fdsan](https://android.googlesource.com/platform/bionic/+/master/docs/fdsan.md)이 프로세스를 끊어 버립니다. 반대로 메인 스레드가 이기면 체인의 첫 가젯이 스택 위 `native_handle`의 `nrFds`를 음수로 덮어 fdsan을 비켜 가고 그다음은 그저 logcat에 한 줄 찍는 일만 남습니다. 열 번쯤 시도하면 성공하는데 logcat에 공격자가 심어 둔 문자열이 떠오르는 순간 system 권한으로 코드가 실행됐다는 게 확인됩니다.

> 💡 논문 저자들은 x86_64 에뮬레이터에서 측정했고, 데이터 전용 익스플로잇이라 ARM 기기로 옮길 때 바꿀 부분은 ROP 체인뿐이라고 밝힙니다. 공격 도구(gdb 플러그인, 청크 헤더 위조용 파이썬 라이브러리)와 사례 연구 코드는 [HexHive/scudo-exploitation](https://github.com/HexHive/scudo-exploitation)에 공개돼 있습니다.

## 그럼 무엇이 막나

그럼 이 공격들은 대체 어디서 멈출까요? 이것도 논문이 빠뜨리지 않고 짚습니다.

Safe Unlink는 Android 14에서 이미 막혔습니다. PerClass 리스트를 포인터가 아니라 primary 힙 영역을 기준으로 한 오프셋으로 저장하게 바뀌었거든요. 그러면 청크를 free해 가짜 연결 리스트를 엮던 길이 끊깁니다. 반면 Forged CommitBase는 secondary 청크를 다루는 방식 그 자체에 뿌리를 박고 있어 여전히 살아 있습니다. 저자들은 secondary 청크를 격리된 영역에서 따로 좇아 free하는 시점에 전에 그 위치에 secondary가 있었는지 되짚자는 확장을 [LLVM 저장소에 올렸](https://github.com/HexHive/scudo-exploitation)지만 성능 부담을 이유로 머지되지 못했습니다. 할당 방식을 밑바닥부터 뜯어고치거나 성능 손해를 감수하지 않는 한, Scudo는 이 기법에 계속 노출된 셈입니다.

하드웨어로 눈을 돌리면 [ARM MTE](https://developer.arm.com/documentation/108035/latest/)가 거의 다 틀어막습니다. MTE는 포인터 상위 비트에 태그를 심고 메모리 영역에도 같은 태그를 매겨 태그가 어긋나는 접근을 폴트로 쳐 냅니다. Scudo는 primary 청크 몸통에 태그를 입히고 헤더에는 뻔히 예측되는 태그(primary 헤더 0, secondary 몸통은 태그 없음, secondary 확장 헤더 1)를 둡니다. 이 태그 탓에 가짜 secondary 헤더를 만들어 내는 일이 극히 좁은 조건에서만 가능해지고 그 결과 두 기법은 대부분 힘을 잃습니다. 2023년 10월부터 MTE를 켠 기기가 풀리기 시작했으니 현실적인 방어선은 이쪽입니다.

그래도 병의 뿌리는 Zygote fork입니다. 거기서 갈라진 프로세스에 한해 무작위화와 보호가 통째로 날아가고 그 순간 Scudo의 보안은 체크섬 계산 비용만 더 무는 glibc 수준으로 떨어집니다. 이건 Scudo에 국한된 게 아니라 Android의 어떤 userspace 할당기를 갖다 놔도 똑같이 걸리는 문제라 Zygote fork 구조를 벗어나지 않는 한 깔끔히 풀리지 않습니다. 한편 Scudo가 기본값이라고 해서 모든 기기가 쓰는 것도 아닙니다. 저자들이 최근 출시된 기기 15대의 libc를 열어 보니 Scudo를 쓴 건 6대뿐, 나머지는 아직 jemalloc이었습니다. 프로덕션까지 실려 나가긴 했어도 jemalloc을 끌어내리진 못한 상태인 거죠.

## 정리

Scudo가 힙 익스플로잇의 난도를 높이는 건 분명합니다. 크기별 격리, 무작위 할당, 체크섬, 인라인 포인터 분리까지 네 겹을 쌓아 올리니까요. 문제는 그중 둘이 비밀에 기대는데 Android가 Zygote fork로 그 비밀을 같은 뿌리의 프로세스들에 고스란히 나눠 준다는 점입니다. 비밀이 걷힌 뒤 논문은 class ID 하나를 0으로 돌려 분리를 깨고 CommitBase나 언링크를 주물러 격리까지 넘어선 끝에 임의 쓰기에 가닿습니다. 할당기 하나를 밑바닥까지 꿰어야 그 위에 얹힌 버그가 얼마나 위험한지 비로소 가늠된다는 것을, 10년 묵은 취약점을 되살려 최신 Android의 system_server를 장악하는 것으로 증명해 보인 연구입니다.

저도 이 논문을 따라가면서 할당기 내부를 처음으로 바닥까지 들여다봤는데, 방어 하나하나가 어디서 무너지는지 손으로 짚어 보니 그제야 그림이 맞춰지더라고요. 긴 글 읽어 주셔서 감사합니다. 다음 글에서 또 뵙겠습니다.