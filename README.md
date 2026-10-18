# AND-LAB

안드로이드 보안 연구실 AND-LAB의 소개 사이트 겸 기술 블로그. Jekyll 4, GitHub Pages(Actions 배포).

## 로컬에서 보기

```bash
bundle install
bundle exec jekyll serve --livereload
```

http://localhost:4000 에서 확인한다.

## 글 쓰기

`_posts/YYYY-MM-DD-슬러그.md` 파일을 만든다. 주소는 `/posts/슬러그/` 가 된다.

```yaml
---
title: 글 제목
description: 목록과 검색 결과에 보이는 한두 문장 요약
category: app        # app | reversing | platform | fuzzing | kernel | hardware | lab
author: seika        # _data/members.yml 의 key
tags: [Frida, Intent]
date: 2026-10-15 10:00:00 +0900
---
```

- `date` 가 지금보다 미래면 배포 빌드에서 글이 빠진다. 과거 시각으로 둔다.
- 이미지는 `assets/img/posts/` 에 두고 `![설명](/assets/img/posts/파일.png)` 로 넣는다.
- 인용문(`>`)은 초록 콜아웃이 된다. 바로 다음 줄에 `{: .warn }` 이나 `{: .danger }` 를 붙이면 노랑·빨강.
- 코드 블록은 언어를 적는다(` ```javascript `, ` ```console ` 등). 언어 표시와 복사 버튼이 자동으로 붙는다.
- `##`, `###` 제목이 3개 이상이면 넓은 화면에서 오른쪽에 목차가 생긴다.

## 내용 고치기

| 바꿀 것 | 파일 |
| --- | --- |
| 사이트 이름, 설명, GitHub·메일, 메뉴, 분야 이름 | `_config.yml` |
| 홈의 연구 분야 카드 | `_data/research.yml` |
| 프로젝트 목록 | `_data/projects.yml` |
| 팀원 소개 페이지(이름, 역할, 분야, 소개, 사진, 링크) | `_data/members.yml` |
| 색·글꼴·레이아웃 | `assets/css/main.css` 맨 위 토큰 |

## 검색 노출 (Google)

1. [Google Search Console](https://search.google.com/search-console)에서 속성 추가 → URL 접두어에 `https://wtcyj.github.io/and-lab/` 입력.
2. 소유권 확인 방법 중 HTML 태그를 골라 `content="..."` 안의 값만 복사한다. 확인 버튼은 아직 누르지 않는다.
3. `_config.yml` 의 `webmaster_verifications.google` 에 그 값을 넣고 푸시한다.
4. Actions 배포가 끝나면 Search Console 에서 확인을 누른다.
5. Sitemaps 메뉴에 `sitemap.xml` 을 제출한다(`https://wtcyj.github.io/and-lab/sitemap.xml` 은 jekyll-sitemap 이 자동으로 만든다).
   처음에 "가져올 수 없음"으로 보여도 반나절쯤 지나면 성공으로 바뀌는 경우가 많다.
6. 바로 검색에 띄우고 싶은 글은 URL 검사에 주소를 넣고 색인 생성 요청을 누른다. 반영까지 며칠 걸린다.

## 배포

1. GitHub에 저장소를 만들고 `main` 브랜치를 푸시한다.
2. 저장소 Settings → Pages → Build and deployment → Source 를 GitHub Actions 로 바꾼다.
3. 이후 `main` 에 푸시할 때마다 `.github/workflows/pages.yml` 이 빌드·배포한다.

저장소 이름이 `조직명.github.io` 면 루트 주소에, 그 밖의 이름이면 `/저장소이름/` 아래에 열린다. 경로는 워크플로가 알아서 맞춘다. 배포 뒤 `_config.yml` 의 `url` 을 실제 주소로 채우면 공유 미리보기와 사이트맵 링크가 맞게 나온다.
