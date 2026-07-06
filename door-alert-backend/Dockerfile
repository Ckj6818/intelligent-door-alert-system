# ---------- Stage 1: Maven 打包 ----------
FROM maven:3.9-eclipse-temurin-17-alpine AS build
WORKDIR /src

COPY pom.xml .
COPY src ./src

RUN mvn -B -q package -DskipTests

# ---------- Stage 2: 运行时镜像 ----------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

COPY --from=build /src/target/door-alert-backend-*.jar /app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "/app.jar"]
