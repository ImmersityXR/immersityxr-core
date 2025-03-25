# serve with nginx
FROM nginx:stable-alpine
COPY ./default.conf /etc/nginx/conf.d/
COPY ./builds /usr/share/nginx/html/builds
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
ENTRYPOINT ["./entrypoint.sh"]