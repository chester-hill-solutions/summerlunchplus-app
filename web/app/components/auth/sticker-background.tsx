import type { CSSProperties, ReactNode } from 'react'

type StickerSpec = {
  src: string
  className: string
  style?: CSSProperties
}

const STICKERS: StickerSpec[] = [
  { src: '/stickers/watermelon.png', className: 'left-[1%] top-[4%] w-20 -rotate-6 sm:w-24 lg:w-28' },
  { src: '/stickers/red_spoon.png', className: 'right-[3%] top-[6%] w-18 rotate-[16deg] sm:w-24' },
  { src: '/stickers/blue_fork.png', className: 'left-[8%] top-[18%] hidden w-14 -rotate-[24deg] sm:block lg:w-16' },
  { src: '/stickers/green_slotted_spoon.png', className: 'right-[2%] top-[26%] hidden w-16 rotate-[12deg] md:block lg:w-20' },
  { src: '/stickers/garden.png', className: 'left-[2%] top-[44%] hidden w-20 -rotate-[10deg] md:block lg:w-24' },
  { src: '/stickers/stocks.png', className: 'right-[1%] top-[48%] hidden w-20 rotate-[10deg] md:block lg:w-24' },
  { src: '/stickers/pink_spatula.png', className: 'left-[4%] bottom-[22%] hidden w-16 -rotate-[14deg] md:block lg:w-20' },
  { src: '/stickers/salad_on_plate.png', className: 'right-[1%] bottom-[14%] w-24 rotate-[5deg] sm:w-28 lg:w-32' },
  { src: '/stickers/hijabi_girl.png', className: 'left-[7%] bottom-[3%] hidden w-18 -rotate-[6deg] lg:block lg:w-20' },
  { src: '/stickers/pink_hair_blue_boy.png', className: 'right-[7%] bottom-[3%] hidden w-18 rotate-[8deg] lg:block lg:w-20' },
  { src: '/stickers/apple.png', className: 'left-[23%] bottom-[9%] w-14 rotate-[10deg] sm:w-16' },
  { src: '/stickers/eggplant.png', className: 'right-[21%] bottom-[9%] w-14 -rotate-[12deg] sm:w-16' },
  { src: '/stickers/cut_pair.png', className: 'left-[28%] top-[6%] hidden w-12 rotate-[7deg] md:block lg:w-14' },
  { src: '/stickers/cut_lemon.png', className: 'right-[28%] top-[7%] hidden w-12 -rotate-[8deg] md:block lg:w-14' },
  { src: '/stickers/green_hair_orange_girl.png', className: 'left-[16%] top-[2%] hidden w-16 -rotate-[10deg] lg:block lg:w-20' },
  { src: '/stickers/plantain.png', className: 'right-[16%] top-[19%] hidden w-14 rotate-[22deg] md:block lg:w-16' },
  { src: '/stickers/radish.png', className: 'left-[6%] top-[64%] hidden w-14 -rotate-[11deg] lg:block' },
  { src: '/stickers/apple_bag.png', className: 'right-[6%] top-[64%] hidden w-16 rotate-[8deg] lg:block' },
  { src: '/stickers/blue_hair_pink_girl.png', className: 'left-[40%] top-[2%] hidden w-16 rotate-[7deg] xl:block' },
  { src: '/stickers/pink_lemon.png', className: 'left-[39%] top-[24%] hidden w-12 -rotate-[8deg] md:block' },
  { src: '/stickers/graphefruit.png', className: 'right-[37%] top-[28%] hidden w-12 rotate-[9deg] md:block' },
  { src: '/stickers/blue_fork.png', className: 'left-[34%] top-[46%] hidden w-12 -rotate-[18deg] md:block' },
  { src: '/stickers/red_spoon.png', className: 'right-[34%] top-[47%] hidden w-12 rotate-[20deg] md:block' },
  { src: '/stickers/cut_pair.png', className: 'left-[44%] bottom-[18%] hidden w-12 rotate-[10deg] md:block' },
  { src: '/stickers/cut_lemon.png', className: 'right-[43%] bottom-[16%] hidden w-12 -rotate-[10deg] md:block' },
]

const DENSE_STICKER_SOURCES = [
  '/stickers/watermelon.png',
  '/stickers/red_spoon.png',
  '/stickers/blue_fork.png',
  '/stickers/green_slotted_spoon.png',
  '/stickers/pink_spatula.png',
  '/stickers/salad_on_plate.png',
  '/stickers/apple.png',
  '/stickers/eggplant.png',
  '/stickers/cut_pair.png',
  '/stickers/cut_lemon.png',
  '/stickers/hijabi_girl.png',
  '/stickers/pink_hair_blue_boy.png',
  '/stickers/garden.png',
  '/stickers/stocks.png',
  '/stickers/green_hair_orange_girl.png',
  '/stickers/plantain.png',
  '/stickers/pink_lemon.png',
  '/stickers/graphefruit.png',
  '/stickers/radish.png',
  '/stickers/apple_bag.png',
  '/stickers/blue_hair_pink_girl.png',
]

const createDenseStickers = (): StickerSpec[] => {
  const columns = 12
  const rows = 14

  return Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const xBase = -8 + (column * 116) / (columns - 1)
    const yBase = -8 + (row * 116) / (rows - 1)
    const xJitter = ((index * 17) % 7) - 3
    const yJitter = ((index * 29) % 7) - 3
    const rotation = ((index * 19) % 40) - 20
    const widthRem = 5 + ((index * 13) % 9) * 0.3

    return {
      src: DENSE_STICKER_SOURCES[index % DENSE_STICKER_SOURCES.length],
      className: 'block',
      style: {
        left: `${xBase + xJitter}%`,
        top: `${yBase + yJitter}%`,
        width: `${widthRem}rem`,
        transform: `rotate(${rotation}deg)`,
      },
    }
  })
}

type AuthStickerBackgroundProps = {
  children: ReactNode
  maxWidthClassName?: string
  dense?: boolean
  scrollContent?: boolean
}

export default function AuthStickerBackground({
  children,
  maxWidthClassName = 'max-w-md',
  dense = false,
  scrollContent = false,
}: AuthStickerBackgroundProps) {
  const allStickers = dense ? createDenseStickers() : STICKERS

  return (
    <div
      className={`relative flex h-[calc(100svh-4rem)] min-h-[calc(100svh-4rem)] w-full justify-center overflow-hidden bg-[#fff7ef] p-4 md:p-8 ${
        scrollContent ? 'items-start' : 'items-center'
      }`}
    >
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${dense ? 'z-20' : ''}`}>
        {allStickers.map((sticker, index) => (
          <img
            key={`${sticker.src}-${index}`}
            src={sticker.src}
            alt=""
            className={`absolute select-none ${
              dense
                ? 'opacity-100'
                : 'opacity-95 saturate-110 drop-shadow-[0_10px_18px_rgba(20,16,30,0.16)]'
            } ${sticker.className}`}
            style={sticker.style}
          />
        ))}
      </div>

      <div
        className={`relative z-30 w-full ${
          scrollContent ? 'max-h-[calc(100%-2rem)] overflow-y-auto md:max-h-[calc(100%-4rem)]' : ''
        } ${maxWidthClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
