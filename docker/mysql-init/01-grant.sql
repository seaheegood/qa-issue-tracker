-- 컨테이너를 처음 만들 때 한 번만 실행된다 (/docker-entrypoint-initdb.d).
--
-- Prisma는 마이그레이션을 검증할 때 임시 DB(shadow database)를 만들었다 지운다.
-- 그래서 앱 사용자(pt)에게 DB 생성 권한이 필요하다.
-- 로컬 개발용 컨테이너이므로 전체 권한을 준다. 운영 서버에서는 이렇게 하지 않는다.
GRANT ALL PRIVILEGES ON *.* TO 'pt'@'%';
FLUSH PRIVILEGES;
