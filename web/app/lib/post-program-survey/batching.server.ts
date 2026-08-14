export const POST_PROGRAM_SURVEY_BATCH_SIZE = 100

export const chunk = <T>(values: T[], size = POST_PROGRAM_SURVEY_BATCH_SIZE): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}
