---
title: Frida로 RootBeer 루팅 탐지 우회하기
description: 루팅 탐지 라이브러리 RootBeer가 무엇을 검사하는지 읽어 보고, Frida 스크립트 한 장으로 판단 결과를 바꿔 봅니다.
category: reversing
author: seika
tags: [Frida, RootBeer, 루팅 탐지]
date: 2026-10-15 10:00:00 +0900
---

금융 앱이나 게임 앱은 루팅된 기기에서 실행을 막는 경우가 많습니다. 그런데 동적 분석을 하려면 루트 권한이 거의 필수라서, 분석가 입장에서는 이 탐지부터 넘어야 합니다.

이 글은 오픈소스 루팅 탐지 라이브러리인 RootBeer를 넣은 실습 앱을 대상으로 합니다. 라이브러리 코드가 공개돼 있어서 무엇을 검사하는지 먼저 읽고, 그다음 Frida로 결과를 바꿉니다.

> 상용 앱의 탐지를 우회하는 건 그 앱의 이용 약관이나 버그 바운티 범위를 먼저 확인한 뒤에 하세요. 이 글의 대상은 직접 빌드한 실습 앱입니다.
{: .danger }

## RootBeer는 무엇을 보나

RootBeer의 `isRooted()`는 여러 검사를 OR로 묶은 메서드입니다. 하나라도 걸리면 루팅으로 판단합니다. 대표적인 검사는 이렇습니다.

| 검사 | 보는 것 |
| --- | --- |
| 루팅 관리 앱 | Magisk, SuperSU 같은 패키지가 설치돼 있는지 |
| su 바이너리 | `/system/xbin`, `/sbin` 같은 경로에 `su` 파일이 있는지 |
| 위험한 속성 | `ro.debuggable`, `ro.secure` 값 |
| 쓰기 가능한 경로 | `/system` 같은 곳이 rw로 마운트돼 있는지 |
| test-keys | 빌드 태그가 `test-keys`인지 |
| 네이티브 검사 | 같은 su 탐색을 JNI 라이브러리에서 한 번 더 |

<figure>
<svg viewBox="0 0 680 230" role="img" aria-label="여러 검사 결과가 isRooted로 모이고, Frida가 isRooted의 반환값을 false로 바꾸는 구조">
<style>
.rb-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.rb-key{fill:var(--bg-2);stroke:var(--accent);stroke-width:2}
.rb-t{font:500 12.5px var(--mono);fill:var(--ink-2)}
.rb-b{font:600 14px var(--mono);fill:var(--ink)}
.rb-a{font:600 12.5px var(--mono);fill:var(--accent)}
.rb-ln{fill:none;stroke:var(--line);stroke-width:1.5}
.rb-hk{fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:6 5}
</style>
<g class="rb-t">
<rect class="rb-box" x="20" y="16" width="200" height="34" rx="8"/><text x="36" y="38">detectRootManagementApps</text>
<rect class="rb-box" x="20" y="60" width="200" height="34" rx="8"/><text x="36" y="82">checkForBinary("su")</text>
<rect class="rb-box" x="20" y="104" width="200" height="34" rx="8"/><text x="36" y="126">checkForDangerousProps</text>
<rect class="rb-box" x="20" y="148" width="200" height="34" rx="8"/><text x="36" y="170">checkForRWPaths</text>
<rect class="rb-box" x="20" y="192" width="200" height="30" rx="8"/><text x="36" y="212">... 외 검사</text>
</g>
<path class="rb-ln" d="M220 33h40q20 0 20 20v62M220 77h40M220 121h60M220 165h40M220 207h40q20 0 20-20v-62M280 121h40"/>
<rect class="rb-key" x="320" y="96" width="150" height="50" rx="10"/>
<text class="rb-b" x="395" y="126" text-anchor="middle">isRooted()</text>
<path class="rb-ln" d="M470 121h60"/>
<rect class="rb-box" x="530" y="96" width="130" height="50" rx="10"/>
<text class="rb-b" x="595" y="126" text-anchor="middle">return false</text>
<path class="rb-hk" d="M395 96V60q0-14 14-14h130"/>
<text class="rb-a" x="420" y="38">Frida가 여기서 반환값을 덮어씀</text>
</svg>
<figcaption>검사가 아무리 많아도 결과가 한 메서드로 모인다면, 그 메서드 하나만 바꾸면 됩니다.</figcaption>
</figure>

검사를 하나씩 피하려면 할 일이 많습니다. Magisk를 숨기고, su 경로를 가리고, 속성값을 바꿔야 하죠. 하지만 앱이 최종 판단을 `isRooted()` 하나에 맡긴다면 그 반환값만 바꾸는 쪽이 훨씬 간단합니다.

## Frida 준비

루팅된 기기(또는 에뮬레이터)에 frida-server를 올립니다. 기기 아키텍처와 PC에 설치한 frida 버전이 같은 frida-server를 받아야 합니다.

```console
$ adb shell getprop ro.product.cpu.abi
arm64-v8a
$ adb push frida-server /data/local/tmp/
$ adb shell "su -c 'chmod 755 /data/local/tmp/frida-server && /data/local/tmp/frida-server &'"
$ frida-ps -U | head -3
  PID  Name
-----  ----------------
 1234  system_server
```

`frida-ps -U`에 기기 프로세스가 보이면 연결된 겁니다.

## 우회 스크립트

`RootBeer` 클래스의 `isRooted` 구현을 바꿔서, 원래 결과는 로그로만 남기고 항상 `false`를 돌려주게 합니다.

```javascript
// bypass.js
Java.perform(() => {
  const RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');

  RootBeer.isRooted.implementation = function () {
    const real = this.isRooted();          // 원래 판단은 그대로 실행해 본다
    console.log(`[*] isRooted() = ${real} -> false`);
    return false;
  };
});
```

앱을 Frida로 새로 띄우면서 스크립트를 넣습니다. `-f`는 앱을 처음부터 실행하므로, 앱이 시작하자마자 검사하는 경우에도 늦지 않습니다.

```console
$ frida -U -f lab.andlab.rootcheck -l bypass.js
Spawned `lab.andlab.rootcheck`. Resuming main thread!
[*] isRooted() = true -> false
```

로그를 보면 원래 판단은 `true`였고, 앱에는 `false`가 전달됐습니다. 화면에는 루팅되지 않은 기기라고 표시됩니다.

## 난독화돼 있다면

실제 앱은 R8로 난독화돼서 `com.scottyab.rootbeer.RootBeer`라는 이름이 남아 있지 않은 경우가 많습니다. 그럴 때는 라이브러리가 쓰는 문자열로 거꾸로 찾아갑니다.

1. jadx에서 `/system/xbin/`, `test-keys`, `com.topjohnwu.magisk` 같은 문자열을 검색합니다.
2. 그 문자열을 쓰는 메서드가 속한 클래스가 난독화된 RootBeer입니다.
3. 여러 검사 메서드를 부르고 결과를 OR로 묶는 메서드가 `isRooted()` 자리입니다.

이름만 바꿔서 같은 스크립트를 쓰면 됩니다. 앱이 `isRooted()` 대신 개별 검사 메서드를 직접 부르는 구조라면, 그 메서드들을 각각 후킹해야 합니다.

> Frida 17부터 Java 브릿지가 런타임 기본 구성에서 빠졌습니다. `frida` CLI로 `-l` 스크립트를 올리면 지금처럼 바로 쓸 수 있지만, 에이전트를 직접 묶어 배포한다면 `frida-java-bridge`를 import해야 합니다.

## 정리

클라이언트 쪽 루팅 탐지는 결국 앱 프로세스 안에서 돌아가는 코드라서, 그 프로세스를 마음대로 고칠 수 있는 사람 앞에서는 오래 버티지 못합니다. 탐지를 만드는 쪽이라면 결과를 한 메서드에 모으지 말고, 서버 쪽 기기 무결성 검증(Play Integrity API)과 함께 쓰는 편이 낫습니다. 다음 글에서는 네이티브 라이브러리 안에서 하는 탐지를 Frida의 `Interceptor`로 다뤄 보겠습니다.
