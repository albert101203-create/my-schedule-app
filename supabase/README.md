# Supabase 연결

1. Supabase에서 새 프로젝트를 만든다.
2. SQL Editor에서 `schema.sql` 전체를 실행한다.
3. Project Settings → API에서 Project URL과 Publishable key를 확인한다.
4. 루트의 `config.js`에 두 값을 입력한다.
5. Authentication → URL Configuration에서 GitHub Pages 주소를 Site URL에 등록한다.

`service_role` 키는 절대 프런트엔드에 넣지 않는다. 브라우저에는 Publishable key만 사용한다.
