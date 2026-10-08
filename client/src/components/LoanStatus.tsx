const statusConfig: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  aceptado: { label: 'Aceptado', color: 'bg-blue-100 text-blue-800' },
  entregado: { label: 'Entregado', color: 'bg-purple-100 text-purple-800' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
  devuelto: { label: 'Devuelto', color: 'bg-green-100 text-green-800' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800' },
  rechazado: { label: 'Rechazado', color: 'bg-gray-100 text-gray-800' },
}

export function LoanStatus({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' }

  return (
    <span
      className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${config.color}`}
      aria-label={`Estado: ${config.label}`}
    >
      {config.label}
    </span>
  )
}
