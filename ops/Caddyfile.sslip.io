# HTTPS gateway on sslip.io host mapping to the public IP
34-107-74-70.sslip.io {
  encode zstd gzip
  header * Cache-Control "no-store"
  reverse_proxy 127.0.0.1:8790
}
