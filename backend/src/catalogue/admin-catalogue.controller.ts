import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppRole, Category, ProductImage, ProductVariant, ProductVideo } from '@prisma/client';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CatalogueProduct, CatalogueProductCard, CatalogueService } from './catalogue.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ImageMetadataDto } from './dto/image-metadata.dto';
import { ImportGoogleDriveImageDto } from './dto/import-google-drive-image.dto';
import { ProductImageMetadataDto } from './dto/product-image-metadata.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { GoogleDriveImageService } from './google-drive-image.service';

const imageInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    files: 1,
    fileSize: 8 * 1024 * 1024,
  },
});

const imagePipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /(jpeg|png|webp|gif)$/ })
  .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
  .build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

const videoInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    files: 1,
    fileSize: 25 * 1024 * 1024,
  },
});

const videoPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /video\/(mp4|webm|quicktime|x-msvideo|mpeg|ogg)$/ })
  .addMaxSizeValidator({ maxSize: 25 * 1024 * 1024 })
  .build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

@Controller('admin/catalogue')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN, AppRole.CATALOGUE_MANAGER)
export class AdminCatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly googleDriveImages: GoogleDriveImageService,
  ) {}

  @Get('categories')
  listCategories(): Promise<Category[]> {
    return this.catalogue.listAdminCategories();
  }

  @Post('categories')
  createCategory(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateCategoryDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<Category> {
    return this.catalogue.createCategory(actor.id, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() input: UpdateCategoryDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<Category> {
    return this.catalogue.updateCategory(actor.id, categoryId, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.catalogue.deleteCategory(actor.id, categoryId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('products')
  listProducts(): Promise<CatalogueProductCard[]> {
    return this.catalogue.listAdminProducts();
  }

  @Get('products/:productId')
  getProduct(@Param('productId', ParseUUIDPipe) productId: string): Promise<CatalogueProduct> {
    return this.catalogue.getAdminProduct(productId);
  }

  @Post('products')
  createProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateProductDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<CatalogueProduct> {
    return this.catalogue.createProduct(actor.id, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Patch('products/:productId')
  updateProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: UpdateProductDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<CatalogueProduct> {
    return this.catalogue.updateProduct(actor.id, productId, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.catalogue.deleteProduct(actor.id, productId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('products/:productId/variants')
  createVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: CreateVariantDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductVariant> {
    return this.catalogue.createVariant(actor.id, productId, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Patch('variants/:variantId')
  updateVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() input: UpdateVariantDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductVariant> {
    return this.catalogue.updateVariant(actor.id, variantId, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.catalogue.deleteVariant(actor.id, variantId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('products/:productId/videos/upload')
  @UseInterceptors(videoInterceptor)
  uploadVideo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile(videoPipe) file: Express.Multer.File,
    @Body() metadata: ImageMetadataDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductVideo> {
    return this.catalogue.uploadProductVideo(actor.id, productId, file, metadata, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('products/:productId/videos/:videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVideo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.catalogue.deleteProductVideo(actor.id, productId, videoId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('products/:productId/images')
  @UseInterceptors(imageInterceptor)
  addImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile(imagePipe) file: Express.Multer.File,
    @Body() metadata: ProductImageMetadataDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductImage> {
    return this.catalogue.addProductImage(actor.id, productId, file, metadata, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('products/:productId/images/google-drive')
  async addGoogleDriveImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: ImportGoogleDriveImageDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductImage> {
    const file = await this.googleDriveImages.download(input.driveUrl);
    return this.catalogue.addProductImage(actor.id, productId, file, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Put('products/:productId/images/:imageId')
  @UseInterceptors(imageInterceptor)
  replaceImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @UploadedFile(imagePipe) file: Express.Multer.File,
    @Body() metadata: ProductImageMetadataDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductImage> {
    return this.catalogue.replaceProductImage(actor.id, productId, imageId, file, metadata, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Patch('products/:productId/images/:imageId')
  updateImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() input: UpdateProductImageDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<ProductImage> {
    return this.catalogue.updateProductImage(actor.id, productId, imageId, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('products/:productId/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.catalogue.deleteProductImage(actor.id, productId, imageId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }
}
