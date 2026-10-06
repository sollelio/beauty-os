export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="app-main" role="alert">
      <h1>Beauty OS</h1>
      <p>Configuration error: {message}</p>
    </div>
  )
}
