import { unref } from 'vue'
import { useWebWorkersStore } from '../../piniaStores/webWorkers'
import { useConfigStore } from '../../piniaStores'
import { useLoadingService } from '../../loadingService'
import { useRequestHeaders } from '../../requestHeaders'
import { createHttpError, type HttpError, type Resource } from '@ownclouders/web-client'
import type { TransferData } from '../../../helpers/resource/conflictHandling'
import PasteWorker from './worker?worker'

export type PasteWorkerReturnData = {
  successful: Resource[]
  failed: { resourceName: string; message: string; statusCode: number; xReqId: string }[]
}

type CallbackOptions = {
  successful: Resource[]
  failed: { resourceName: string; error: HttpError }[]
}

/**
 * Web worker for pasting copied/cut resources into another location.
 */
export const usePasteWorker = () => {
  const configStore = useConfigStore()
  const loadingService = useLoadingService()
  const { headers } = useRequestHeaders()
  const { createWorker, terminateWorker } = useWebWorkersStore()

  const startWorker = (
    transferData: TransferData[],
    callback: (result: CallbackOptions) => void
  ) => {
    const worker = createWorker<PasteWorkerReturnData>(PasteWorker as unknown as string, {
      needsTokenRenewal: true
    })

    let resolveLoading: (value: unknown) => void

    unref(worker.worker).onmessage = (e: MessageEvent) => {
      terminateWorker(worker.id)
      resolveLoading?.(true)

      const { successful, failed } = JSON.parse(e.data) as PasteWorkerReturnData

      // construct http error based on the parsed error data
      const failedWithErrors = failed.map(({ resourceName, ...errorData }) => {
        return { resourceName, error: createHttpError(errorData) }
      })

      callback({ successful, failed: failedWithErrors })
    }

    loadingService.addTask(
      () =>
        new Promise((res) => {
          resolveLoading = res
        })
    )

    worker.post(getWorkerData(transferData))
  }

  const getWorkerData = (transferData: TransferData[]) => {
    return JSON.stringify({
      topic: 'startProcess',
      data: {
        transferData,
        baseUrl: configStore.serverUrl,
        headers: unref(headers)
      }
    })
  }

  return { startWorker }
}
